import { AdminPermissions, ResetProfileRequestFieldType } from './common';

export interface AdminResetProfileRequestDTO {
    fields: ResetProfileRequestFieldType[];
}

export interface AdminSoftDeleteUserRequestDTO {
    reason?: string;
}

export interface AdminUpdateUserPermissionsRequestDTO {
    permissions: AdminPermissions;
}

export interface AdminBanUserRequestDTO {
    reason: string;
    duration: number; // in minutes
}

export interface AdminWarnUserRequestDTO {
    message: string;
}
