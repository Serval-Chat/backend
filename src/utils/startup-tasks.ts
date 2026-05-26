import { Ping as PingModel } from '@/models/Ping';
import { Friendship } from '@/models/Friendship';
import {
    Channel as ChannelModel,
    Role as RoleModel,
    ServerMember as ServerMemberModel,
} from '@/models/Server';
import type { IKlipyCache } from '@/models/KlipyCache';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { Model } from 'mongoose';
import logger from '@/utils/logger';
import { Types } from 'mongoose';

interface PingModelLike {
    distinct(field: string, query: object): Promise<Types.ObjectId[]>;
    deleteMany(query: object): Promise<{ deletedCount: number }>;
}

interface ChannelModelLike {
    find(
        query: object,
        projection: object,
    ): { lean(): Promise<{ _id: unknown }[]> };
}

interface RoleModelLike {
    find(
        query: object,
        projection: object,
    ): { lean(): Promise<{ _id: unknown; serverId: unknown }[]> };
}

interface ServerMemberModelLike {
    updateMany(
        filter: object,
        update: object,
    ): Promise<{ modifiedCount: number }>;
}

export async function cleanupOrphanedPings(
    pingModel: PingModelLike = PingModel,
    channelModel: ChannelModelLike = ChannelModel,
): Promise<void> {
    try {
        const referencedChannelIds = await pingModel.distinct('channelId', {
            channelId: { $exists: true, $ne: null },
        });

        if (referencedChannelIds.length === 0) {
            logger.info(
                '[PingCleanup] No channel pings found - nothing to clean up.',
            );
            return;
        }

        const existingChannels = await channelModel
            .find({ _id: { $in: referencedChannelIds } }, { _id: 1 })
            .lean();

        const existingIds = new Set(
            existingChannels.map((c) => (c._id as Types.ObjectId).toString()),
        );

        const orphanedIds = referencedChannelIds.filter(
            (id: Types.ObjectId) => !existingIds.has(id.toString()),
        );

        if (orphanedIds.length === 0) {
            logger.info('[PingCleanup] No orphaned channel pings found.');
            return;
        }

        const result = await pingModel.deleteMany({
            channelId: { $in: orphanedIds },
        });

        logger.info(
            `[PingCleanup] Deleted ${result.deletedCount} orphaned ping(s) referencing ${orphanedIds.length} deleted channel(s).`,
        );
    } catch (error) {
        logger.error(
            '[PingCleanup] Error while cleaning up orphaned pings:',
            error,
        );
    }
}

export async function repairEveryoneRoles(
    roleModel: RoleModelLike = RoleModel,
    memberModel: ServerMemberModelLike = ServerMemberModel,
): Promise<void> {
    try {
        const everyoneRoles = await roleModel
            .find({ name: '@everyone', position: 0 }, { _id: 1, serverId: 1 })
            .lean();

        if (everyoneRoles.length === 0) {
            logger.info(
                '[EveryoneRepair] No @everyone roles found - skipping.',
            );
            return;
        }

        let totalFixed = 0;

        for (const role of everyoneRoles) {
            const roleId = role._id as Types.ObjectId;
            const serverId = role.serverId as Types.ObjectId;

            const result = await memberModel.updateMany(
                { serverId, roles: { $ne: roleId } },
                { $addToSet: { roles: roleId } },
            );

            if (result.modifiedCount > 0) {
                logger.info(
                    `[EveryoneRepair] Fixed ${result.modifiedCount} member(s) in server ${serverId} missing @everyone.`,
                );
                totalFixed += result.modifiedCount;
            }
        }

        if (totalFixed === 0) {
            logger.info(
                '[EveryoneRepair] All members already have their @everyone role.',
            );
        } else {
            logger.info(
                `[EveryoneRepair] Done - assigned @everyone to ${totalFixed} member(s) total.`,
            );
        }
    } catch (error) {
        logger.error(
            '[EveryoneRepair] Error while repairing @everyone roles:',
            error,
        );
    }
}

export async function cleanupDeadPings(
    pingModel: typeof PingModel = PingModel,
    friendshipModel: typeof Friendship = Friendship,
): Promise<void> {
    try {
        const dmPings = await pingModel
            .find({ serverId: { $exists: false } })
            .lean();

        if (dmPings.length === 0) {
            logger.info(
                '[DeadPingCleanup] No DM pings found - nothing to clean up.',
            );
            return;
        }

        const seenPairs = new Set<string>();
        for (const ping of dmPings) {
            const uid = (ping.userId as Types.ObjectId).toString();
            const sid = (ping.senderId as Types.ObjectId).toString();
            const key = uid < sid ? `${uid}:${sid}` : `${sid}:${uid}`;
            seenPairs.add(key);
        }

        let deletedCount = 0;

        for (const key of seenPairs) {
            const [a, b] = key.split(':');
            const aOid = new Types.ObjectId(a);
            const bOid = new Types.ObjectId(b);

            const friendship = await friendshipModel.findOne({
                $or: [
                    { userId: aOid, friendId: bOid },
                    { userId: bOid, friendId: aOid },
                ],
            });

            if (!friendship) {
                const result = await pingModel.deleteMany({
                    $or: [
                        { userId: aOid, senderId: bOid },
                        { userId: bOid, senderId: aOid },
                    ],
                    serverId: { $exists: false },
                });
                deletedCount += result.deletedCount;
            }
        }

        if (deletedCount === 0) {
            logger.info('[DeadPingCleanup] No dead DM pings found.');
        } else {
            logger.info(
                `[DeadPingCleanup] Deleted ${deletedCount} dead DM ping(s) across ${seenPairs.size} unique user pair(s).`,
            );
        }
    } catch (error) {
        logger.error(
            '[DeadPingCleanup] Error while cleaning up dead pings:',
            error,
        );
    }
}

export async function flushAllCaches(
    redisService: IRedisService,
    klipyCacheModel: Model<IKlipyCache>,
): Promise<void> {
    try {
        logger.info('[CacheFlush] Flushing all caches...');

        await redisService.getClient().flushdb();
        logger.info('[CacheFlush] Redis database flushed.');

        const result = await klipyCacheModel.deleteMany({});
        logger.info(
            `[CacheFlush] KlipyCache cleared (${result.deletedCount} items).`,
        );

        logger.info('[CacheFlush] Done.');
    } catch (error) {
        logger.error('[CacheFlush] Error while flushing caches:', error);
    }
}
