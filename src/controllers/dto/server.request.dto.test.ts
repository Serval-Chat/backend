import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateServerRequestDTO } from './server.request.dto';

const validateUpdate = async (value: unknown) => {
    const dto = plainToInstance(UpdateServerRequestDTO, value);
    return validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
};

describe('UpdateServerRequestDTO deleted message retention', () => {
    it.each([5, 10, 20, 30, 60, 120, 360, 720, 1440, 4320])(
        'accepts %i minutes',
        async (minutes) => {
            expect(
                await validateUpdate({
                    deletedMessageRetentionMinutes: minutes,
                }),
            ).toHaveLength(0);
        },
    );

    it.each([4, 15, 45, 4321, 5.5, '30', null])(
        'rejects unsafe retention value %p',
        async (minutes) => {
            expect(
                await validateUpdate({
                    deletedMessageRetentionMinutes: minutes,
                }),
            ).not.toHaveLength(0);
        },
    );

    it('rejects unknown settings fields', async () => {
        expect(
            await validateUpdate({
                deletedMessageRetentionMinutes: 30,
                deletedMessageRetentionHours: 100,
            }),
        ).not.toHaveLength(0);
    });
});
