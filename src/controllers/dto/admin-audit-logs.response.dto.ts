import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminNoteAdminInfoDTO } from './admin-notes.dto';

export type AdminAuditLogJsonValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | AdminAuditLogJsonObject
    | AdminAuditLogJsonValue[];

export class AdminAuditLogJsonObject {
    [key: string]: AdminAuditLogJsonValue;
}

export class AdminAuditLogChangeDTO {
    @ApiProperty()
    public field!: string;
    @ApiProperty({ type: 'object', additionalProperties: true })
    public before!: AdminAuditLogJsonValue;
    @ApiProperty({ type: 'object', additionalProperties: true })
    public after!: AdminAuditLogJsonValue;
}

export class AdminAuditLogListItemDTO {
    @ApiProperty()
    public id!: string;
    @ApiPropertyOptional()
    public serverId?: string;
    @ApiProperty()
    public actorId!: string;
    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    public actorIdUser?: AdminNoteAdminInfoDTO;
    @ApiProperty()
    public actionType!: string;
    @ApiPropertyOptional()
    public targetId?: string;
    @ApiPropertyOptional({
        enum: ['user', 'channel', 'category', 'role', 'message', 'server'],
    })
    public targetType?:
        | 'user'
        | 'channel'
        | 'category'
        | 'role'
        | 'message'
        | 'server';
    @ApiPropertyOptional()
    public targetUserId?: string;
    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    public targetUserIdUser?: AdminNoteAdminInfoDTO;
    @ApiPropertyOptional({ type: [AdminAuditLogChangeDTO] })
    public changes?: AdminAuditLogChangeDTO[];
    @ApiPropertyOptional()
    public reason?: string;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true })
    public additionalData?: AdminAuditLogJsonObject;
    @ApiProperty()
    public timestamp!: Date;
}

export type AdminAuditLogListResponseDTO = AdminAuditLogListItemDTO[];
