import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { AdminBanSampleDTO, AdminBanHistoryItemDTO } from './types.dto';
import { AdminNoteAdminInfoDTO } from './admin-notes.dto';

export type AdminUserBanHistoryResponseDTO = AdminBanHistoryItemDTO[];

export class AdminBanListItemDTO {
    @ApiProperty()
    public id!: string;
    @ApiProperty()
    public userId!: string;
    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    public user?: AdminNoteAdminInfoDTO;
    @ApiProperty()
    public reason!: string;
    @ApiProperty()
    public active!: boolean;
    @ApiPropertyOptional()
    public expirationTimestamp?: Date;
    @ApiPropertyOptional()
    public createdAt?: Date;
    @ApiPropertyOptional()
    public timestamp?: Date;
    @ApiPropertyOptional()
    public issuedBy?: string;
    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    public issuedByUser?: AdminNoteAdminInfoDTO;
}

export type AdminBanListResponseDTO = AdminBanListItemDTO[];

export class AdminBansDiagnosticResponseDTO {
    @ApiProperty({
        type: 'object',
        properties: {
            count: { type: 'number' },
            sample: { type: 'array', items: { type: 'object' } },
        },
    })
    public appBans!: {
        count: number;
        sample: AdminBanSampleDTO[];
    };

    @ApiProperty({
        type: 'object',
        properties: {
            count: { type: 'number' },
            sample: { type: 'array', items: { type: 'object' } },
        },
    })
    public serverBans!: {
        count: number;
        sample: AdminBanSampleDTO[];
    };
}
