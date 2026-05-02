import { ApiProperty } from '@nestjs/swagger';

import { AdminBanSampleDTO, AdminBanHistoryItemDTO } from './types.dto';

import type { IBan } from '@/di/interfaces/IBanRepository';

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
