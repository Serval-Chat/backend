import { ApiProperty } from '@nestjs/swagger';

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

export type AdminBanListResponseDTO = any[]; // Using any[] for now as the internal Ban model is complex

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
        sample: any[];
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
        sample: any[];
    };
}

