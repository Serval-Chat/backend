import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
    AdminStatsRangeDTO,
    AdminStatsRequestDTO,
} from '../dto/admin-stats.request.dto';

async function check(query: Record<string, unknown>) {
    return await validate(plainToInstance(AdminStatsRequestDTO, query));
}

describe('AdminStatsRequestDTO', () => {
    it.each(['24h', '7d', '30d', 'all'])('accepts range=%s', async (range) => {
        expect(await check({ range })).toHaveLength(0);
    });

    it('accepts an omitted range', async () => {
        expect(await check({})).toHaveLength(0);
    });

    it.each(['1h', 'forever', '', '24H', '7'])(
        'rejects range=%p instead of silently using 24h',
        async (range) => {
            const errors = await check({ range });
            expect(errors).toHaveLength(1);
            expect(errors[0]?.property).toBe('range');
        },
    );

    it('exposes the four documented values', () => {
        expect(Object.values(AdminStatsRangeDTO)).toEqual([
            '24h',
            '7d',
            '30d',
            'all',
        ]);
    });
});
