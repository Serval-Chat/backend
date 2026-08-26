/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChannelService } from '../ChannelService';

describe('ChannelService - getOrCreateDmChannel', () => {
    let mockChannelRepo: {
        findDmChannelByRecipients: jest.Mock;
        create: jest.Mock;
    };
    let service: ChannelService;

    beforeEach(() => {
        mockChannelRepo = {
            findDmChannelByRecipients: jest.fn(),
            create: jest.fn(),
        };
        service = new ChannelService(mockChannelRepo as any);
    });

    it('creates a new DM channel with sorted recipientIds when none exists', async () => {
        mockChannelRepo.findDmChannelByRecipients.mockResolvedValue(null);
        const created = {
            snowflakeId: 'chan1',
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        };
        mockChannelRepo.create.mockResolvedValue(created);

        const result = await service.getOrCreateDmChannel('userB', 'userA');

        expect(mockChannelRepo.findDmChannelByRecipients).toHaveBeenCalledWith([
            'userA',
            'userB',
        ]);
        expect(mockChannelRepo.create).toHaveBeenCalledWith({
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });
        expect(result).toBe(created);
    });

    it('returns the existing channel without creating a new one', async () => {
        const existing = {
            snowflakeId: 'chan1',
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        };
        mockChannelRepo.findDmChannelByRecipients.mockResolvedValue(existing);

        const result = await service.getOrCreateDmChannel('userA', 'userB');

        expect(result).toBe(existing);
        expect(mockChannelRepo.create).not.toHaveBeenCalled();
    });

    it('is idempotent regardless of argument order', async () => {
        mockChannelRepo.findDmChannelByRecipients.mockResolvedValue(null);
        mockChannelRepo.create.mockResolvedValue({
            snowflakeId: 'chan1',
            type: 'dm',
            recipientIds: ['userA', 'userB'],
        });

        await service.getOrCreateDmChannel('userA', 'userB');
        await service.getOrCreateDmChannel('userB', 'userA');

        expect(
            mockChannelRepo.findDmChannelByRecipients,
        ).toHaveBeenNthCalledWith(1, ['userA', 'userB']);
        expect(
            mockChannelRepo.findDmChannelByRecipients,
        ).toHaveBeenNthCalledWith(2, ['userA', 'userB']);
    });
});
