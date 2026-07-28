/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { SettingsController } from '../SettingsController';
import { FrequentlyUsedEmojiTypeDTO } from '../dto/frequently-used-emoji.dto';

describe('SettingsController - frequently used emojis', () => {
    let controller: SettingsController;

    const mockUserRepo = {
        findById: jest.fn(),
        updateFrequentlyUsedEmojis: jest.fn().mockResolvedValue(undefined),
    } as any;

    const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
    } as any;

    const mockWsServer = {
        broadcastToUser: jest.fn(),
    } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new SettingsController(
            mockUserRepo,
            mockLogger,
            mockWsServer,
        );
    });

    describe('getFrequentlyUsedEmojis', () => {
        test('returns the stored list for the current user', async () => {
            const stored = [
                {
                    emoji: '😀',
                    emojiType: 'unicode',
                    count: 3,
                    lastUsedAt: new Date('2026-07-27T12:00:00.000Z'),
                },
            ];
            mockUserRepo.findById.mockResolvedValue({
                snowflakeId: 'u1',
                frequentlyUsedEmojis: stored,
            });

            const result = await controller.getFrequentlyUsedEmojis('u1');

            expect(result).toEqual({ emojis: stored });
        });

        test('returns an empty array when the user has never used any emoji', async () => {
            mockUserRepo.findById.mockResolvedValue({ snowflakeId: 'u1' });

            const result = await controller.getFrequentlyUsedEmojis('u1');

            expect(result).toEqual({ emojis: [] });
        });

        test('throws NotFoundException when the user does not exist', async () => {
            mockUserRepo.findById.mockResolvedValue(null);

            await expect(
                controller.getFrequentlyUsedEmojis('missing'),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateFrequentlyUsedEmojis', () => {
        test('persists the full list and broadcasts to the user', async () => {
            const body = {
                emojis: [
                    {
                        emoji: '😀',
                        emojiType: FrequentlyUsedEmojiTypeDTO.UNICODE,
                        count: 3,
                        lastUsedAt: '2026-07-27T12:00:00.000Z',
                    },
                    {
                        emoji: 'party_blob',
                        emojiType: FrequentlyUsedEmojiTypeDTO.CUSTOM,
                        emojiId: '1234567890123456789',
                        count: 1,
                        lastUsedAt: '2026-07-27T13:00:00.000Z',
                    },
                ],
            };

            const result = await controller.updateFrequentlyUsedEmojis(
                'u1',
                body,
            );

            expect(
                mockUserRepo.updateFrequentlyUsedEmojis,
            ).toHaveBeenCalledWith('u1', [
                expect.objectContaining({
                    emoji: '😀',
                    emojiType: 'unicode',
                    count: 3,
                    lastUsedAt: new Date('2026-07-27T12:00:00.000Z'),
                }),
                expect.objectContaining({
                    emoji: 'party_blob',
                    emojiType: 'custom',
                    emojiId: '1234567890123456789',
                    count: 1,
                    lastUsedAt: new Date('2026-07-27T13:00:00.000Z'),
                }),
            ]);

            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                'u1',
                expect.objectContaining({
                    type: 'user_updated',
                    payload: expect.objectContaining({ userId: 'u1' }),
                }),
            );

            expect(result.message).toBe(
                'Frequently used emojis updated successfully',
            );
            expect(result.emojis).toHaveLength(2);
        });

        test('does not carry over an emojiId for unicode entries', async () => {
            const body = {
                emojis: [
                    {
                        emoji: '😀',
                        emojiType: FrequentlyUsedEmojiTypeDTO.UNICODE,
                        count: 1,
                        lastUsedAt: '2026-07-27T12:00:00.000Z',
                    },
                ],
            };

            await controller.updateFrequentlyUsedEmojis('u1', body);

            const [, persisted] =
                mockUserRepo.updateFrequentlyUsedEmojis.mock.calls[0];
            expect(persisted[0].emojiId).toBeUndefined();
        });

        test('does not throw when the broadcast fails', async () => {
            mockWsServer.broadcastToUser.mockImplementation(() => {
                throw new Error('ws down');
            });

            await expect(
                controller.updateFrequentlyUsedEmojis('u1', {
                    emojis: [],
                } as any),
            ).resolves.toEqual(expect.objectContaining({ emojis: [] }));

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
