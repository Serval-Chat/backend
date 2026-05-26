export type PermissionScope = 'server' | 'channel';

export interface PermissionDefinition {
    readonly scope: PermissionScope;
    readonly default: boolean;
    readonly timeoutBlocked?: boolean;
}

export const PERMISSION_REGISTRY = {
    viewCategories: { scope: 'channel', default: true },
    viewChannels: { scope: 'channel', default: true },
    sendMessages: {
        scope: 'channel',
        default: true,
        timeoutBlocked: true,
    },
    addReactions: {
        scope: 'channel',
        default: true,
        timeoutBlocked: true,
    },
    connect: { scope: 'channel', default: true },
    manageMessages: { scope: 'channel', default: false },
    deleteMessagesOfOthers: { scope: 'channel', default: false },
    manageChannels: { scope: 'server', default: false },
    manageRoles: { scope: 'server', default: false },
    banMembers: { scope: 'server', default: false },
    kickMembers: { scope: 'server', default: false },
    manageInvites: { scope: 'server', default: false },
    manageServer: { scope: 'server', default: false },
    administrator: { scope: 'server', default: false },
    manageWebhooks: { scope: 'server', default: false },
    pingRolesAndEveryone: { scope: 'server', default: false },
    manageReactions: { scope: 'channel', default: false },
    exportChannelMessages: { scope: 'server', default: false },
    bypassSlowmode: { scope: 'channel', default: false },
    bypassMarkdownRestrictions: { scope: 'channel', default: false },
    pinMessages: { scope: 'channel', default: false },
    seeDeletedMessages: { scope: 'channel', default: false },
    moderateMembers: { scope: 'server', default: false },
    manageStickers: { scope: 'server', default: false },
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionKey = keyof typeof PERMISSION_REGISTRY;

export const PERMISSION_KEYS = Object.freeze(
    Object.keys(PERMISSION_REGISTRY),
) as readonly PermissionKey[];

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(key: string): key is PermissionKey {
    return PERMISSION_KEY_SET.has(key);
}

export function getPermissionDefault(permission: PermissionKey): boolean {
    return PERMISSION_REGISTRY[permission].default;
}

export function isTimeoutBlockedPermission(permission: PermissionKey): boolean {
    const definition: PermissionDefinition = PERMISSION_REGISTRY[permission];
    return definition.timeoutBlocked === true;
}
