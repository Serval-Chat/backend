/* eslint-disable @typescript-eslint/no-explicit-any */
import { SettingsController } from '../SettingsController';

describe('SettingsController - notification sound volume/normalizationGain', () => {
    let controller: SettingsController;

    const mockUserRepo = {
        findById: jest.fn(),
        updateSettings: jest.fn().mockResolvedValue(undefined),
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

    describe('getSettings', () => {
        it('defaults notificationVolume and per-sound volume/normalizationGain for users who predate those fields', async () => {
            mockUserRepo.findById.mockResolvedValue({
                snowflakeId: 'u1',
                settings: {
                    notificationSounds: [
                        {
                            id: 's1',
                            name: 'Legacy',
                            url: 'http://x/s1.ogg',
                            enabled: true,
                        },
                    ],
                },
            });

            const result = await controller.getSettings('u1');

            expect(result.notificationVolume).toBe(1);
            expect(result.notificationSounds).toEqual([
                expect.objectContaining({
                    id: 's1',
                    volume: 1,
                    normalizationGain: 1,
                }),
            ]);
        });

        it('preserves an already-set notificationVolume and per-sound values', async () => {
            mockUserRepo.findById.mockResolvedValue({
                snowflakeId: 'u1',
                settings: {
                    notificationVolume: 0.6,
                    notificationSounds: [
                        {
                            id: 's1',
                            name: 'Ding',
                            url: 'http://x/s1.ogg',
                            enabled: true,
                            volume: 0.3,
                            normalizationGain: 1.8,
                        },
                    ],
                },
            });

            const result = await controller.getSettings('u1');

            expect(result.notificationVolume).toBe(0.6);
            expect(result.notificationSounds).toEqual([
                expect.objectContaining({
                    volume: 0.3,
                    normalizationGain: 1.8,
                }),
            ]);
        });
    });

    describe('updateSettings', () => {
        it('ignores a client-submitted volume and keeps the stored value, since volume is only ever set via the dedicated PATCH /notification-sounds/:id endpoint', async () => {
            mockUserRepo.findById
                .mockResolvedValueOnce({
                    snowflakeId: 'u1',
                    settings: {
                        notificationSounds: [
                            {
                                id: 's1',
                                name: 'Ding',
                                url: 'http://x/s1.ogg',
                                enabled: true,
                                volume: 0.7,
                                normalizationGain: 2,
                            },
                        ],
                    },
                })
                .mockResolvedValueOnce({
                    snowflakeId: 'u1',
                    settings: { notificationSounds: [] },
                });

            await controller.updateSettings('u1', {
                notificationSounds: [
                    {
                        id: 's1',
                        name: 'Ding',
                        url: 'http://x/s1.ogg',
                        enabled: false,
                    },
                ],
            });

            expect(mockUserRepo.updateSettings).toHaveBeenCalledWith('u1', {
                notificationSounds: [
                    expect.objectContaining({
                        id: 's1',
                        enabled: false,
                        volume: 0.7,
                        normalizationGain: 2,
                    }),
                ],
            });
        });

        it('defaults volume/normalizationGain to 1 for a brand new sound id with no prior stored value', async () => {
            mockUserRepo.findById
                .mockResolvedValueOnce({
                    snowflakeId: 'u1',
                    settings: { notificationSounds: [] },
                })
                .mockResolvedValueOnce({
                    snowflakeId: 'u1',
                    settings: { notificationSounds: [] },
                });

            await controller.updateSettings('u1', {
                notificationSounds: [
                    {
                        id: 'new-sound',
                        name: 'New',
                        url: 'http://x/new.ogg',
                        enabled: true,
                    },
                ],
            });

            expect(mockUserRepo.updateSettings).toHaveBeenCalledWith('u1', {
                notificationSounds: [
                    expect.objectContaining({
                        id: 'new-sound',
                        volume: 1,
                        normalizationGain: 1,
                    }),
                ],
            });
        });
    });
});
