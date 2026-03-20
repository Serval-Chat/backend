import { Types } from 'mongoose';
import type { IAuditLog } from '@/di/interfaces/IAuditLogRepository';

/**
 * Shape the audit log entry for the frontend (shared between API and WebSocket)
 */
export function mapAuditLogEntry(entry: IAuditLog) {
    const actor = entry.actorId as unknown as
        | {
              _id: Types.ObjectId;
              username?: string;
              displayName?: string | null;
              profilePicture?: string;
          }
        | Types.ObjectId;

    const actorObj =
        actor instanceof Types.ObjectId
            ? null
            : (actor as { _id: Types.ObjectId; username?: string; displayName?: string | null; profilePicture?: string });

    const targetUser = entry.targetUserId as unknown as
        | {
              _id: Types.ObjectId;
              username?: string;
              displayName?: string | null;
          }
        | Types.ObjectId
        | null
        | undefined;

    const targetUserObj =
        targetUser === null || targetUser instanceof Types.ObjectId
            ? null
            : (targetUser as { _id: Types.ObjectId; username?: string; displayName?: string | null });

    const metadata = entry.metadata ?? {};
    const metadataObj = metadata instanceof Map ? Object.fromEntries(metadata) : metadata;

    const resolvedName = (
        metadataObj.targetName ||
        metadataObj.channelName ||
        metadataObj.roleName ||
        metadataObj.categoryName ||
        metadataObj.emojiName ||
        metadataObj.code
    ) as string | undefined;

    return {
        id: entry._id.toString(),
        action: entry.actionType,
        moderatorId: actorObj?._id?.toString() ?? entry.actorId.toString(),
        moderator: {
            id: actorObj?._id?.toString() ?? entry.actorId.toString(),
            username: actorObj?.username ?? 'Unknown',
            avatarUrl: actorObj?.profilePicture,
        },
        targetId: entry.targetId?.toString(),
        targetType: entry.targetType,
        target: targetUserObj
            ? {
                  id: targetUserObj._id?.toString(),
                  username: targetUserObj.username,
                  name: targetUserObj.displayName ?? targetUserObj.username,
              }
            : resolvedName
              ? { 
                  id: entry.targetId?.toString(), 
                  name: resolvedName 
                }
              : undefined,
        changes: entry.changes,
        reason: entry.reason,
        metadata: metadataObj,
        createdAt: entry.timestamp.toISOString(),
    };
}
