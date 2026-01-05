import type { AdminPermissions } from '@/routes/api/v1/admin/permissions';

export type { AdminPermissions };

export enum ProfileFieldDTO {
    USERNAME = 'username',
    DISPLAY_NAME = 'displayName',
    PRONOUNS = 'pronouns',
    BIO = 'bio',
    BANNER = 'banner',
    PROFILE_PICTURE = 'profilePicture',
}

// Keeping the type alias for compatibility if needed, but the enum is preferred for validation
export type ResetProfileRequestFieldTypeDTO = ProfileFieldDTO;

export enum ChannelTypeDTO {
    TEXT = 'text',
    VOICE = 'voice',
}

export enum MessageAlignmentDTO {
    LEFT = 'left',
    RIGHT = 'right',
}

export enum AdminUserFilterDTO {
    BANNED = 'banned',
    ADMIN = 'admin',
    RECENT = 'recent',
}

export enum ServerBannerTypeDTO {
    COLOR = 'color',
    IMAGE = 'image',
    GIF = 'gif',
}
