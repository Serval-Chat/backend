import { Types } from 'mongoose';

import { Server } from '@/models/Server';

import { MongooseServerRepository } from './MongooseServerRepository';

describe('MongooseServerRepository deleted message retention', () => {
    const repo = new MongooseServerRepository();

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('defaults new server documents to the maximum retention window', () => {
        const server = new Server({ name: 'Retention', ownerId: 'owner' });

        expect(server.deletedMessageRetentionMinutes).toBe(4320);
    });

    it('rejects out-of-range or fractional values at the schema boundary', async () => {
        const belowMinimum = new Server({
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 4,
        });
        const fractional = new Server({
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 5.5,
        });
        const unsupportedDuration = new Server({
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 45,
        });
        const aboveMaximum = new Server({
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 4321,
        });

        await expect(belowMinimum.validate()).rejects.toHaveProperty(
            'errors.deletedMessageRetentionMinutes',
        );
        await expect(fractional.validate()).rejects.toHaveProperty(
            'errors.deletedMessageRetentionMinutes',
        );
        await expect(unsupportedDuration.validate()).rejects.toHaveProperty(
            'errors.deletedMessageRetentionMinutes',
        );
        await expect(aboveMaximum.validate()).rejects.toHaveProperty(
            'errors.deletedMessageRetentionMinutes',
        );
    });

    it('persists only sanitized values through repository updates', async () => {
        const returned = {
            _id: new Types.ObjectId(),
            snowflakeId: '1234567890123456789',
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 4320,
        };
        const query = { lean: jest.fn().mockResolvedValue(returned) };
        const update = jest
            .spyOn(Server, 'findOneAndUpdate')
            .mockReturnValue(query as never);

        await repo.update('1234567890123456789', {
            deletedMessageRetentionMinutes: 100_000,
        });

        expect(update).toHaveBeenCalledWith(
            {
                snowflakeId: '1234567890123456789',
                deletedAt: { $exists: false },
            },
            { deletedMessageRetentionMinutes: 4320 },
            { returnDocument: 'after' },
        );
    });

    it('normalizes missing legacy values when reading server data', async () => {
        const returned = {
            _id: new Types.ObjectId(),
            snowflakeId: '1234567890123456789',
            name: 'Legacy',
            ownerId: 'owner',
        };
        const query = { lean: jest.fn().mockResolvedValue(returned) };
        jest.spyOn(Server, 'findOne').mockReturnValue(query as never);

        const server = await repo.findById('1234567890123456789');

        expect(server?.deletedMessageRetentionMinutes).toBe(4320);
    });

    it('snaps direct repository updates to a supported duration', async () => {
        const returned = {
            _id: new Types.ObjectId(),
            snowflakeId: '1234567890123456789',
            name: 'Retention',
            ownerId: 'owner',
            deletedMessageRetentionMinutes: 30,
        };
        const query = { lean: jest.fn().mockResolvedValue(returned) };
        const update = jest
            .spyOn(Server, 'findOneAndUpdate')
            .mockReturnValue(query as never);

        await repo.update('1234567890123456789', {
            deletedMessageRetentionMinutes: 45,
        });

        expect(update).toHaveBeenCalledWith(
            {
                snowflakeId: '1234567890123456789',
                deletedAt: { $exists: false },
            },
            { deletedMessageRetentionMinutes: 30 },
            { returnDocument: 'after' },
        );
    });
});
