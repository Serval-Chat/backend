import { BOT_PERMISSION_KEYS } from '../models/Bot';
import type { BotPermissionKey, BotPermissions } from '../models/Bot';
import type { Permissions } from '@/permissions/types';

export const BOT_PERMISSION_BITS: Record<BotPermissionKey, number> = {
    readMessages: 1 << 0,
    sendMessages: 1 << 1,
    manageMessages: 1 << 2,
    readUsers: 1 << 3,
    joinServers: 1 << 4,
    manageServer: 1 << 5,
    manageChannels: 1 << 6,
    manageMembers: 1 << 7,
    readReactions: 1 << 8,
    addReactions: 1 << 9,
    viewChannels: 1 << 10,
    connect: 1 << 11,
    deleteMessagesOfOthers: 1 << 12,
    manageRoles: 1 << 13,
    banMembers: 1 << 14,
    kickMembers: 1 << 15,
    manageInvites: 1 << 16,
    administrator: 1 << 17,
    manageWebhooks: 1 << 18,
    pingRolesAndEveryone: 1 << 19,
    manageReactions: 1 << 20,
    exportChannelMessages: 1 << 21,
    bypassSlowmode: 1 << 22,
    pinMessages: 1 << 23,
    seeDeletedMessages: 1 << 24,
    moderateMembers: 1 << 25,
    manageStickers: 1 << 26,
};

/**
 * Converts BotPermissions object to a bitmask integer
 */
export function permissionsToBitmask(permissions: BotPermissions): number {
    let bitmask = 0;
    for (const [key, bit] of Object.entries(BOT_PERMISSION_BITS)) {
        if (permissions[key as BotPermissionKey] === true) {
            bitmask |= bit;
        }
    }
    return bitmask;
}

/**
 * Converts a bitmask integer to a BotPermissions object
 */
export function bitmaskToPermissions(bitmask: number): BotPermissions {
    const permissions: BotPermissions = {};
    for (const key of BOT_PERMISSION_KEYS) {
        permissions[key] = (bitmask & BOT_PERMISSION_BITS[key]) !== 0;
    }
    return permissions;
}

/**
 * Maps BotPermissions to Server Role permissions
 */
export function mapBotToServerPermissions(
    botPerms: BotPermissions,
): Permissions {
    return {
        viewChannels:
            botPerms.viewChannels === true || botPerms.readMessages === true,
        connect: botPerms.connect,
        sendMessages: botPerms.sendMessages,
        manageMessages: botPerms.manageMessages,
        deleteMessagesOfOthers: botPerms.deleteMessagesOfOthers,
        manageChannels: botPerms.manageChannels,
        manageRoles: botPerms.manageRoles,
        banMembers: botPerms.banMembers,
        kickMembers: botPerms.kickMembers,
        manageInvites: botPerms.manageInvites,
        manageServer: botPerms.manageServer,
        administrator: botPerms.administrator,
        manageWebhooks: botPerms.manageWebhooks,
        pingRolesAndEveryone: botPerms.pingRolesAndEveryone,
        manageReactions: botPerms.manageReactions,
        addReactions: botPerms.addReactions,
        exportChannelMessages: botPerms.exportChannelMessages,
        bypassSlowmode: botPerms.bypassSlowmode,
        pinMessages: botPerms.pinMessages,
        seeDeletedMessages: botPerms.seeDeletedMessages,
        moderateMembers:
            botPerms.moderateMembers === true ||
            botPerms.manageMembers === true,
        manageStickers: botPerms.manageStickers,
    };
}
