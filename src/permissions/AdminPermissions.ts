/**
 * Admin Permissions Interface.
 *
 * Defines the available granular permissions for admin users.
 */
export interface AdminPermissions {
    [key: string]: boolean;
    adminAccess: boolean; // Super admin access (bypasses other checks)
    viewUsers: boolean; // Can view user lists and details
    manageUsers: boolean; // Can edit user profiles and soft delete
    manageBadges: boolean; // Can create, update, and assign badges
    banUsers: boolean; // Can ban and unban users
    viewBans: boolean; // Can view ban lists
    warnUsers: boolean; // Can issue warnings to users
    viewLogs: boolean; // Can view audit logs
    manageServer: boolean; // Can manage servers (delete/restore)
    manageInvites: boolean; // Can manage registration invites
    manageBots: boolean; // Can manage bot verification
}

export const DEFAULT_PERMISSIONS: AdminPermissions = {
    adminAccess: false,
    viewUsers: false,
    manageUsers: false,
    manageBadges: false,
    banUsers: false,
    viewBans: false,
    warnUsers: false,
    viewLogs: false,
    manageServer: false,
    manageInvites: false,
    manageBots: false,
};

// Array of permission keys for reference
export const PERMISSION_KEYS = [
    'adminAccess',
    'viewUsers',
    'manageUsers',
    'manageBadges',
    'banUsers',
    'viewBans',
    'warnUsers',
    'viewLogs',
    'manageServer',
    'manageInvites',
    'manageBots',
] as const;
