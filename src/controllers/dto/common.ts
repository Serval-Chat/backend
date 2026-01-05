import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

export type { AdminPermissions };

export type ResetProfileRequestFieldType =
    | 'username'
    | 'displayName'
    | 'pronouns'
    | 'bio'
    | 'banner';
