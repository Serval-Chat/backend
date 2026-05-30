import {
    ApiProperty,
    ApiPropertyOptional,
    getSchemaPath,
    ApiExtraModels,
} from '@nestjs/swagger';
import { ServerRolePermissionsDTO } from './server-role.response.dto';
import {
    MarkdownBlockadeRuleDTO,
    PermissionOverridesMapDTO,
} from './server-channel.request.dto';

export class AuditLogPositionChangeDTO {
    @ApiPropertyOptional()
    public channelId?: string;
    @ApiPropertyOptional()
    public categoryId?: string;
    @ApiPropertyOptional()
    public roleId?: string;
    @ApiProperty()
    public position!: number;
}

export class AuditLogOnboardingConfigDTO {
    @ApiProperty()
    public enabled!: boolean;
    @ApiProperty({ type: [String] })
    public guidelines!: string[];
    @ApiProperty({ type: [String] })
    public selfAssignableRoleIds!: string[];
    @ApiPropertyOptional({ nullable: true })
    public landingChannelId?: string | null;
    @ApiProperty({ type: [String] })
    public welcomeChannelIds!: string[];
}

@ApiExtraModels(
    AuditLogPositionChangeDTO,
    MarkdownBlockadeRuleDTO,
    ServerRolePermissionsDTO,
    PermissionOverridesMapDTO,
    AuditLogOnboardingConfigDTO,
)
export class AuditLogChangeItemDTO {
    @ApiProperty()
    public field!: string;

    @ApiPropertyOptional({
        oneOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } },
            {
                type: 'array',
                items: { $ref: getSchemaPath(AuditLogPositionChangeDTO) },
            },
            {
                type: 'array',
                items: { $ref: getSchemaPath(MarkdownBlockadeRuleDTO) },
            },
            { $ref: getSchemaPath(ServerRolePermissionsDTO) },
            { $ref: getSchemaPath(PermissionOverridesMapDTO) },
            { $ref: getSchemaPath(AuditLogOnboardingConfigDTO) },
        ],
    })
    public before?:
        | string
        | number
        | boolean
        | null
        | string[]
        | AuditLogPositionChangeDTO[]
        | MarkdownBlockadeRuleDTO[]
        | ServerRolePermissionsDTO
        | PermissionOverridesMapDTO
        | AuditLogOnboardingConfigDTO;

    @ApiPropertyOptional({
        oneOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } },
            {
                type: 'array',
                items: { $ref: getSchemaPath(AuditLogPositionChangeDTO) },
            },
            {
                type: 'array',
                items: { $ref: getSchemaPath(MarkdownBlockadeRuleDTO) },
            },
            { $ref: getSchemaPath(ServerRolePermissionsDTO) },
            { $ref: getSchemaPath(PermissionOverridesMapDTO) },
            { $ref: getSchemaPath(AuditLogOnboardingConfigDTO) },
        ],
    })
    public after?:
        | string
        | number
        | boolean
        | null
        | string[]
        | AuditLogPositionChangeDTO[]
        | MarkdownBlockadeRuleDTO[]
        | ServerRolePermissionsDTO
        | PermissionOverridesMapDTO
        | AuditLogOnboardingConfigDTO;
}

export class AuditLogMetadataDTO {
    @ApiPropertyOptional()
    public channelName?: string;

    @ApiPropertyOptional()
    public channelType?: string;

    @ApiPropertyOptional()
    public categoryName?: string;

    @ApiPropertyOptional()
    public emojiName?: string;

    @ApiPropertyOptional()
    public stickerName?: string;

    @ApiPropertyOptional()
    public roleName?: string;

    @ApiPropertyOptional()
    public channelId?: string;

    @ApiPropertyOptional()
    public messageId?: string;

    @ApiPropertyOptional()
    public inviteCode?: string;

    @ApiPropertyOptional()
    public until?: string;

    @ApiPropertyOptional()
    public status?: string;
}

export class AuditLogModeratorDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public username!: string;

    @ApiPropertyOptional()
    public avatarUrl?: string;
}

export class AuditLogTargetDTO {
    @ApiPropertyOptional()
    public id?: string;

    @ApiPropertyOptional()
    public username?: string;

    @ApiPropertyOptional()
    public name?: string;

    @ApiPropertyOptional()
    public avatarUrl?: string;
}

export class ServerAuditLogEntryDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public action!: string;

    @ApiProperty()
    public moderatorId!: string;

    @ApiProperty({ type: AuditLogModeratorDTO })
    public moderator!: AuditLogModeratorDTO;

    @ApiPropertyOptional()
    public targetId?: string;

    @ApiPropertyOptional()
    public targetType?: string;

    @ApiPropertyOptional({ type: AuditLogTargetDTO })
    public target?: AuditLogTargetDTO;

    @ApiPropertyOptional({ type: [AuditLogChangeItemDTO] })
    public changes?: AuditLogChangeItemDTO[];

    @ApiPropertyOptional()
    public reason?: string;

    @ApiPropertyOptional({ type: () => AuditLogMetadataDTO })
    public metadata?: AuditLogMetadataDTO;

    @ApiProperty()
    public createdAt!: string;
}

export class ServerAuditLogResponseDTO {
    @ApiProperty({ type: [ServerAuditLogEntryDTO] })
    public entries!: ServerAuditLogEntryDTO[];

    @ApiPropertyOptional({ type: String, nullable: true })
    public nextCursor!: string | null;
}
