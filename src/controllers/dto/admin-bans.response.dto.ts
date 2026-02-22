import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import type { IBan } from '@/di/interfaces/IBanRepository';

export class AdminBanHistoryItemDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;

    @ApiProperty()
    reason!: string;

    @ApiProperty()
    timestamp!: Date;

    @ApiProperty()
    expirationTimestamp!: Date;

    @ApiProperty()
    @IsMongoId()
    @IsString()
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
            sample: { type: 'array', items: { type: 'object' } },
        },
    })
    appBans!: {
        count: number;
        sample: unknown[];
    };

    @ApiProperty({
        type: 'object',
        properties: {
            count: { type: 'number' },
            sample: { type: 'array', items: { type: 'object' } },
        },
    })
    serverBans!: {
        count: number;
        sample: unknown[];
    };
}
