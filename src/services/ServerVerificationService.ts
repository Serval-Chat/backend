import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    Server,
    ServerBan,
    ServerMember,
    ServerMessage,
    ServerVerificationStats,
} from '@/models/Server';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STATS_KEY = 'server-verification';

type ServerMetric = {
    serverId: string;
    memberCount: number;
    messageCount: number;
    activeSenderCount: number;
    banCount: number;
    topSenderShare: number;
    participationRate: number;
    banRate: number;
    serverAgeDays: number;
    score: number;
    eligible: boolean;
    failureReasons: string[];
    override: 'verified' | 'unverified' | null;
    wasVerified: boolean;
    verified: boolean;
};

export type ServerVerificationStatsSnapshot = {
    p80Threshold: number;
    p65Threshold: number;
    p95T: number;
    p95M: number;
    p95B: number;
    eligibleServerCount: number;
    verifiedServerCount: number;
    lastRunAt: Date | null;
};

@Injectable()
export class ServerVerificationService
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(ServerVerificationService.name);
    private timer?: NodeJS.Timeout;
    private running = false;

    public onModuleInit(): void {
        const intervalMs = this.getIntervalMs();
        setTimeout(() => {
            void this.recompute().catch((error) => {
                this.logger.error('Initial verification run failed', error);
            });
        }, 0);
        this.timer = setInterval(() => {
            void this.recompute().catch((error) => {
                this.logger.error('Scheduled verification run failed', error);
            });
        }, intervalMs);
    }

    public onModuleDestroy(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
        }
    }

    public async getStats(): Promise<ServerVerificationStatsSnapshot> {
        const stats = await ServerVerificationStats.findOne({
            key: STATS_KEY,
        }).lean();

        return {
            p80Threshold: stats?.p80Threshold ?? 0,
            p65Threshold: stats?.p65Threshold ?? 0,
            p95T: stats?.p95T ?? 0,
            p95M: stats?.p95M ?? 0,
            p95B: stats?.p95B ?? 0,
            eligibleServerCount: stats?.eligibleServerCount ?? 0,
            verifiedServerCount: stats?.verifiedServerCount ?? 0,
            lastRunAt: stats?.lastRunAt ?? null,
        };
    }

    public async recompute(): Promise<ServerVerificationStatsSnapshot> {
        if (this.running) {
            throw new Error(
                'Server verification recomputation is already running.',
            );
        }

        this.running = true;
        try {
            const now = new Date();
            const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const servers = await Server.find({
                deletedAt: { $exists: false },
            }).lean();
            const serverIds = servers.map((server) => server._id);

            const [memberCounts, banCounts, senderCounts] = await Promise.all([
                this.countByServer(ServerMember, serverIds),
                this.countByServer(ServerBan, serverIds),
                this.countRecentMessagesBySender(serverIds, since),
            ]);

            const metrics = servers.map<ServerMetric>((server) => {
                const serverId = server._id.toString();
                const senderMap = senderCounts.get(serverId) ?? new Map();
                const messageCount = [...senderMap.values()].reduce(
                    (sum, count) => sum + count,
                    0,
                );
                const topSenderMessages =
                    senderMap.size > 0 ? Math.max(...senderMap.values()) : 0;
                const memberCount = memberCounts.get(serverId) ?? 0;
                const activeSenderCount = senderMap.size;
                const banCount = banCounts.get(serverId) ?? 0;
                const participationRate =
                    memberCount > 0 ? activeSenderCount / memberCount : 0;
                const banRate = memberCount > 0 ? banCount / memberCount : 0;
                const topSenderShare =
                    messageCount > 0 ? topSenderMessages / messageCount : 0;
                const createdAt = server.createdAt;
                const serverAgeDays = Math.floor(
                    (now.getTime() - createdAt.getTime()) /
                        (24 * 60 * 60 * 1000),
                );
                const failureReasons = this.getEligibilityFailureReasons({
                    memberCount,
                    messageCount,
                    activeSenderCount,
                    participationRate,
                    topSenderShare,
                    serverAgeDays,
                });

                return {
                    serverId,
                    memberCount,
                    messageCount,
                    activeSenderCount,
                    banCount,
                    topSenderShare,
                    participationRate,
                    banRate,
                    serverAgeDays,
                    score: 0,
                    eligible: failureReasons.length === 0,
                    failureReasons,
                    override: server.verificationOverride ?? null,
                    wasVerified: server.verified === true,
                    verified: false,
                };
            });

            const eligibleMetrics = metrics.filter((metric) => metric.eligible);
            const p95T = percentile(
                eligibleMetrics.map((metric) => metric.messageCount),
                95,
            );
            const p95M = percentile(
                eligibleMetrics.map((metric) => metric.memberCount),
                95,
            );
            const p95B = percentile(
                eligibleMetrics.map((metric) => metric.banCount),
                95,
            );

            for (const metric of eligibleMetrics) {
                metric.score = this.calculateScore(metric, p95T, p95M, p95B);
            }

            const scores = eligibleMetrics.map((metric) => metric.score);
            const p80Threshold = percentile(scores, 80);
            const p65Threshold = percentile(scores, 65);

            for (const metric of metrics) {
                if (metric.override === 'verified') {
                    metric.verified = true;
                } else if (metric.override === 'unverified') {
                    metric.verified = false;
                } else if (!metric.eligible) {
                    metric.verified = false;
                } else if (!metric.wasVerified) {
                    metric.verified = metric.score >= p80Threshold;
                } else {
                    metric.verified = metric.score >= p65Threshold;
                }
            }

            if (metrics.length > 0) {
                await Server.bulkWrite(
                    metrics.map((metric) => ({
                        updateOne: {
                            filter: {
                                _id: new Types.ObjectId(metric.serverId),
                            },
                            update: {
                                $set: {
                                    verified: metric.verified,
                                    verificationScore: metric.score,
                                    verificationEligible: metric.eligible,
                                    verificationLastComputedAt: now,
                                    verificationFailureReasons:
                                        metric.failureReasons,
                                },
                            },
                        },
                    })),
                );
            }

            const verifiedServerCount = metrics.filter(
                (metric) => metric.verified,
            ).length;
            const stats = {
                p80Threshold,
                p65Threshold,
                p95T,
                p95M,
                p95B,
                eligibleServerCount: eligibleMetrics.length,
                verifiedServerCount,
                lastRunAt: now,
            };

            await ServerVerificationStats.findOneAndUpdate(
                { key: STATS_KEY },
                { $set: { key: STATS_KEY, ...stats } },
                { upsert: true, new: true },
            );

            return stats;
        } finally {
            this.running = false;
        }
    }

    private getIntervalMs(): number {
        const configured = Number(process.env.SERVER_VERIFICATION_INTERVAL_MS);
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        return DEFAULT_INTERVAL_MS;
    }

    private async countByServer(
        model: typeof ServerMember | typeof ServerBan,
        serverIds: Types.ObjectId[],
    ): Promise<Map<string, number>> {
        const rows = await model.aggregate<{
            _id: Types.ObjectId;
            count: number;
        }>([
            { $match: { serverId: { $in: serverIds } } },
            { $group: { _id: '$serverId', count: { $sum: 1 } } },
        ]);
        return new Map(rows.map((row) => [row._id.toString(), row.count]));
    }

    private async countRecentMessagesBySender(
        serverIds: Types.ObjectId[],
        since: Date,
    ): Promise<Map<string, Map<string, number>>> {
        const rows = await ServerMessage.aggregate<{
            _id: { serverId: Types.ObjectId; senderId: Types.ObjectId };
            count: number;
        }>([
            {
                $match: {
                    serverId: { $in: serverIds },
                    createdAt: { $gte: since },
                    deletedAt: { $exists: false },
                },
            },
            {
                $group: {
                    _id: { serverId: '$serverId', senderId: '$senderId' },
                    count: { $sum: 1 },
                },
            },
        ]);

        const result = new Map<string, Map<string, number>>();
        for (const row of rows) {
            const serverId = row._id.serverId.toString();
            const senderId = row._id.senderId.toString();
            const senderMap = result.get(serverId) ?? new Map<string, number>();
            senderMap.set(senderId, row.count);
            result.set(serverId, senderMap);
        }
        return result;
    }

    private getEligibilityFailureReasons(input: {
        memberCount: number;
        messageCount: number;
        activeSenderCount: number;
        participationRate: number;
        topSenderShare: number;
        serverAgeDays: number;
    }): string[] {
        const failures: string[] = [];
        if (input.memberCount < 10) failures.push('M < 10');
        if (input.messageCount < 500) failures.push('T < 500');
        if (input.activeSenderCount < 5) failures.push('A < 5');
        if (input.participationRate < 0.3 && input.activeSenderCount < 100) {
            failures.push('R < 0.3 and A < 100');
        }
        if (input.topSenderShare > 0.5) {
            failures.push('top_sender_share > 0.5');
        }
        if (input.serverAgeDays < 30) failures.push('server_age < 30');
        return failures;
    }

    private calculateScore(
        metric: ServerMetric,
        p95T: number,
        p95M: number,
        p95B: number,
    ): number {
        const tScore = logScore(metric.messageCount, p95T);
        const mScore = logScore(metric.memberCount, p95M);
        const rScore = clamp(metric.participationRate / 0.6, 0, 1);
        const bScore = logScore(metric.banCount, p95B);
        const banPenalty =
            metric.banRate <= 0.2 ? 0 : (metric.banRate - 0.2) * 50;

        return (
            rScore * 35 +
            tScore * 30 +
            mScore * 20 +
            Math.sqrt(tScore * mScore) * 25 +
            bScore * 5 -
            banPenalty
        );
    }
}

function percentile(values: number[], percentileValue: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(
        0,
        Math.min(
            sorted.length - 1,
            Math.ceil((percentileValue / 100) * sorted.length) - 1,
        ),
    );
    return sorted[index] ?? 0;
}

function logScore(value: number, reference: number): number {
    const denominator = Math.log10(reference + 1);
    if (denominator <= 0) return value > 0 ? 1 : 0;
    return clamp(Math.log10(value + 1) / denominator, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
