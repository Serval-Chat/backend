import { Ping as PingModel } from '@/models/Ping';
import {
    Channel as ChannelModel,
    Role as RoleModel,
    ServerMember as ServerMemberModel,
} from '@/models/Server';
import logger from '@/utils/logger';
import type { Types } from 'mongoose';

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
                '[PingCleanup] No channel pings found — nothing to clean up.',
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
                '[EveryoneRepair] No @everyone roles found — skipping.',
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
                `[EveryoneRepair] Done — assigned @everyone to ${totalFixed} member(s) total.`,
            );
        }
    } catch (error) {
        logger.error(
            '[EveryoneRepair] Error while repairing @everyone roles:',
            error,
        );
    }
}
