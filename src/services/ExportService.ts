import { injectable, inject } from 'inversify';
import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Inject,
} from '@nestjs/common';
import { Types } from 'mongoose';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { TYPES } from '@/di/types';
import type { IExportJobRepository } from '@/di/interfaces/IExportJobRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IMailService } from '@/di/interfaces/IMailService';
import { PingService } from '@/services/PingService';
import { WsServer } from '@/ws/server';
import { randomBytes } from 'crypto';
import { type IExportJob, ExportJob } from '@/models/ExportJob';
import { SERVER_URL } from '@/config/env';

@injectable()
@Injectable()
export class ExportService implements OnModuleInit, OnModuleDestroy {
    private jobInterval: NodeJS.Timeout | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly EXPORT_DIR = path.join(
        process.cwd(),
        'uploads',
        'exports',
    );

    public constructor(
        @inject(TYPES.ExportJobRepository)
        @Inject(TYPES.ExportJobRepository)
        private exportJobRepo: IExportJobRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.MailService)
        @Inject(TYPES.MailService)
        private mailService: IMailService,
        @inject(TYPES.PingService)
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
    ) {}

    public async onModuleInit() {
        if (
            !(await fs
                .access(this.EXPORT_DIR)
                .then(() => true)
                .catch(() => false))
        ) {
            await fs.mkdir(this.EXPORT_DIR, { recursive: true });
        }
        this.startBackgroundTasks();
    }

    public onModuleDestroy() {
        this.stopBackgroundTasks();
    }

    private startBackgroundTasks() {
        this.jobInterval = setInterval(() => {
            void this.processJobs();
        }, 60 * 1000);
        this.cleanupInterval = setInterval(() => {
            void this.cleanupExpiredExports();
        }, 3600 * 1000);

        this.processJobs().catch((err) =>
            this.logger.error(
                '[ExportService] Initial job processing failed',
                err,
            ),
        );
        this.cleanupExpiredExports().catch((err) =>
            this.logger.error('[ExportService] Initial cleanup failed', err),
        );
    }

    private stopBackgroundTasks() {
        if (this.jobInterval) clearInterval(this.jobInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    }

    public async getExportState(channelId: Types.ObjectId) {
        const channel = await this.channelRepo.findById(channelId);
        if (!channel) return 'unknown';

        const latestJob =
            await this.exportJobRepo.findLatestByChannel(channelId);

        if (
            latestJob &&
            (latestJob.status === 'queued' ||
                latestJob.status === 'in_progress')
        ) {
            return 'in_progress';
        }

        if (channel.lastExportAt) {
            const coolingDownUntil = new Date(
                channel.lastExportAt.getTime() + 7 * 24 * 3600 * 1000,
            );
            if (new Date() < coolingDownUntil) {
                return { state: 'cooling_down', availableAt: coolingDownUntil };
            }
        }

        return { state: 'available' };
    }

    public async requestExport(
        serverId: Types.ObjectId,
        channelId: Types.ObjectId,
        userId: Types.ObjectId,
    ) {
        const state = await this.getExportState(channelId);
        if (typeof state === 'object' && state.state !== 'available') {
            throw new Error('Export not available for this channel');
        }
        if (state === 'in_progress') {
            throw new Error('Export already in progress');
        }

        const job = await this.exportJobRepo.create({
            serverId,
            channelId,
            requestedBy: userId,
            status: 'queued',
            attempts: 0,
            nextAttemptAt: new Date(),
        });

        await this.channelRepo.update(channelId, { lastExportAt: new Date() });
        this.processJobs().catch((err) =>
            this.logger.error('[ExportService] Job processing error', err),
        );

        return job;
    }

    public async processJobs() {
        const jobs = await this.exportJobRepo.findPendingJobs();
        for (const job of jobs) {
            try {
                await this.runExport(job);
            } catch (err) {
                this.logger.error(
                    `[ExportService] Failed to process job ${job._id}`,
                    err,
                );
                await this.handleJobFailure(
                    job,
                    err instanceof Error ? err.message : String(err),
                );
            }
        }
    }

    private async runExport(job: IExportJob) {
        await this.exportJobRepo.update(job._id, { status: 'in_progress' });

        const channel = await this.channelRepo.findById(job.channelId);
        if (!channel) {
            await this.handleJobFailure(job, 'Channel no longer exists');
            return;
        }

        const fileName = `channel-${job.channelId.toString()}.json`;
        const filePath = path.join(this.EXPORT_DIR, `${job._id}-${fileName}`);

        const writeStream = createWriteStream(filePath);
        try {
            writeStream.write('[\n');

            const cursor = this.serverMessageRepo.findCursorByChannelId(
                job.channelId,
            );
            let first = true;

            for await (const m of cursor) {
                if (!first) {
                    writeStream.write(',\n');
                }
                const data = {
                    content: m.text,
                    sender_user_id: m.senderId.toString(),
                    sent_at: m.createdAt.toISOString(),
                    edited_at: m.editedAt ? m.editedAt.toISOString() : null,
                };
                writeStream.write(JSON.stringify(data, null, 2));
                first = false;
            }

            writeStream.write('\n]');
            writeStream.end();

            await new Promise<void>((resolve, reject) => {
                writeStream.on('finish', () => resolve());
                writeStream.on('error', reject);
            });
        } catch (err) {
            writeStream.destroy();
            await fs.unlink(filePath).catch(() => {});
            throw err;
        }

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);

        await this.exportJobRepo.update(job._id, {
            status: 'completed',
            filePath,
            downloadToken: token,
            expiresAt,
            completedAt: new Date(),
        });

        await this.sendSuccessNotifications(job, token);
    }

    private async handleJobFailure(job: IExportJob, error: string) {
        const attempts = job.attempts + 1;
        if (attempts >= job.maxAttempts) {
            await this.exportJobRepo.update(job._id, {
                status: 'failed',
                attempts,
                error,
            });
            await this.channelRepo.update(job.channelId, {
                lastExportAt: undefined,
            });
            await this.sendFailureNotifications(job);
        } else {
            const delays = [5, 15, 30, 60];
            const delayInMinutes = delays[attempts - 1] ?? 60;
            const nextAttemptAt = new Date(
                Date.now() + delayInMinutes * 60 * 1000,
            );

            await this.exportJobRepo.update(job._id, {
                status: 'queued',
                attempts,
                error,
                nextAttemptAt,
            });
        }
    }

    private async sendSuccessNotifications(job: IExportJob, token: string) {
        const user = await this.userRepo.findById(job.requestedBy);
        const server = await this.serverRepo.findById(job.serverId);
        const channel = await this.channelRepo.findById(job.channelId);

        if (!user || !server || !channel) return;

        const downloadUrl = `${SERVER_URL}/api/v1/exports/download/${token}`;

        if (
            user.login !== undefined &&
            user.login !== '' &&
            this.isValidEmail(user.login)
        ) {
            await this.mailService.sendExportSuccessEmail(
                user.login,
                channel.name,
                server.name,
                downloadUrl,
            );
        }

        await this.pingService.addPing(user._id, {
            type: 'export_status',
            sender: 'System',
            senderId: new Types.ObjectId().toString(),
            serverId: job.serverId.toString(),
            channelId: job.channelId.toString(),
            message: {
                _id: job._id.toString(),
                text: `Message export for **${server.name}** / \`#${channel.name}\` is complete! Please open your mail inbox to download the file. Note: the file will be deleted in 48 hours.`,
                type: 'success',
            },
        });

        this.wsServer.broadcastToUser(user._id.toString(), {
            type: 'export_completed',
            payload: { channelId: job.channelId, jobId: job._id },
        });
    }

    private async sendFailureNotifications(job: IExportJob) {
        const user = await this.userRepo.findById(job.requestedBy);
        const server = await this.serverRepo.findById(job.serverId);
        const channel = await this.channelRepo.findById(job.channelId);

        if (!user || !server || !channel) return;

        if (
            user.login !== undefined &&
            user.login !== '' &&
            this.isValidEmail(user.login)
        ) {
            await this.mailService.sendExportFailureEmail(
                user.login,
                channel.name,
                server.name,
            );
        }

        await this.pingService.addPing(user._id, {
            type: 'export_status',
            sender: 'System',
            senderId: new Types.ObjectId().toString(),
            serverId: job.serverId.toString(),
            channelId: job.channelId.toString(),
            message: {
                _id: job._id.toString(),
                text: `We've failed to export messages for \`#${channel.name}\` on **${server.name}** after multiple attempts. Please try again from channel settings.`,
                type: 'failure',
            },
        });
    }

    public async handleChannelDeletion(
        channelId: Types.ObjectId,
        channelNameAtDeletion: string,
        serverNameAtDeletion: string,
    ) {
        const jobs = await ExportJob.find({
            channelId,
            status: { $in: ['queued', 'in_progress'] },
        });
        for (const job of jobs) {
            await this.exportJobRepo.update(job._id, {
                status: 'cancelled',
                error: 'Channel deleted',
            });

            const user = await this.userRepo.findById(job.requestedBy);
            if (user) {
                if (
                    user.login !== undefined &&
                    user.login !== '' &&
                    this.isValidEmail(user.login)
                ) {
                    await this.mailService.sendExportCancelledEmail(
                        user.login,
                        channelNameAtDeletion,
                        serverNameAtDeletion,
                    );
                }

                await this.pingService.addPing(user._id, {
                    type: 'export_status',
                    sender: 'System',
                    senderId: new Types.ObjectId().toString(),
                    message: {
                        _id: job._id.toString(),
                        text: `Your message export for \`#${channelNameAtDeletion}\` on **${serverNameAtDeletion}** was cancelled because the channel was deleted before the export could complete.`,
                        type: 'cancelled',
                    },
                });
            }
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return (
            emailRegex.test(email) &&
            !email.toLowerCase().endsWith('@example.com')
        );
    }

    public async cleanupExpiredExports() {
        const expiredJobs = await this.exportJobRepo.findExpiredJobs();
        for (const job of expiredJobs) {
            if (job.filePath !== undefined && job.filePath !== '') {
                await fs
                    .unlink(job.filePath)
                    .catch((err) =>
                        this.logger.error(
                            `[ExportService] Failed to delete file ${job.filePath}`,
                            err,
                        ),
                    );
            }
            await this.exportJobRepo.delete(job._id);
        }
    }
}
