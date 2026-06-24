import type { IAuditLog } from '@/di/interfaces/IAuditLogRepository';

/**
 * Shape the audit log entry for the frontend (shared between API and WebSocket)
 */
export function mapAuditLogEntry(entry: IAuditLog) {
    const actorObj = entry.actorIdUser ?? null;
    const targetUserObj = entry.targetUserIdUser ?? null;

    const metadata = entry.metadata ?? {};
    const metadataObj =
        metadata instanceof Map ? Object.fromEntries(metadata) : metadata;

    const m = metadataObj as Record<string, unknown>;
    const resolvedName =
        (m['targetName'] as string | undefined) ??
        (m['channelName'] as string | undefined) ??
        (m['roleName'] as string | undefined) ??
        (m['categoryName'] as string | undefined) ??
        (m['emojiName'] as string | undefined) ??
        (m['code'] as string | undefined);

    return {
        id: entry.snowflakeId,
        action: entry.actionType,
        moderatorId: entry.actorId,
        moderator: {
            id: entry.actorId,
            username: actorObj?.username ?? 'Unknown',
            avatarUrl: actorObj?.profilePicture,
        },
        targetId: entry.targetId?.toString(),
        targetType: entry.targetType,
        target: targetUserObj
            ? {
                  id: entry.targetUserId,
                  username: targetUserObj.username,
                  name: targetUserObj.displayName ?? targetUserObj.username,
                  avatarUrl: targetUserObj.profilePicture,
              }
            : resolvedName !== undefined && resolvedName !== ''
              ? {
                    id: entry.targetId?.toString(),
                    name: resolvedName,
                }
              : undefined,
        changes: entry.changes,
        reason: entry.reason,
        metadata: metadataObj,
        createdAt: entry.timestamp.toISOString(),
    };
}
