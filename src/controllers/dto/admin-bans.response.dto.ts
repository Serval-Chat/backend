import { ApiProperty } from '@nestjs/swagger';
import type { IBan } from '@/di/interfaces/IBanRepository';

export class AdminBanHistoryItemDTO {
    @ApiProperty()
    _id!: string;
    @ApiProperty()
    reason!: string;
    @ApiProperty()
    timestamp!: Date;
    @ApiProperty()
    expirationTimestamp!: Date;
    @ApiProperty()
    issuedBy!: string;
    @ApiProperty()
    active!: boolean;
}

export type AdminUserBanHistoryResponseDTO = AdminBanHistoryItemDTO[];

export type AdminBanListResponseDTO = IBan[];

export class AdminBansDiagnosticResponseDTO {
    @ApiProperty({
        type: 'object',
        properties: {
            count: { type: 'number' },
            sample: { type: 'array', items: { type: 'object' } }
        }
    })
    appBans!: {
        count: number;
        sample: unknown[];
    };

    @ApiProperty({
        type: 'object',
        properties: {
            count: { type: 'number' },
            sample: { type: 'array', items: { type: 'object' } }
        }
    })
    serverBans!: {
        count: number;
        sample: unknown[];
    };
}

