/* eslint-disable @typescript-eslint/no-explicit-any */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotificationSoundController } from '../NotificationSoundController';
import { AuthGuard } from '@/modules/auth/auth.module';
import { IsHumanGuard } from '@/modules/auth/bot.guard';
import { IS_PUBLIC_KEY } from '@/modules/auth/public.decorator';

describe('NotificationSoundController - guards', () => {
    it('requires auth and blocks bots for the whole controller', () => {
        const guards =
            Reflect.getMetadata(GUARDS_METADATA, NotificationSoundController) ??
            [];

        expect(guards).toContain(AuthGuard);
        expect(guards).toContain(IsHumanGuard);
    });

    it('does not mark playSound as public-only-for-humans (bot check would be a no-op there anyway, but it must stay reachable without auth)', () => {
        const isPublic = Reflect.getMetadata(
            IS_PUBLIC_KEY,
            NotificationSoundController.prototype.playSound,
        );

        expect(isPublic).toBe(true);
    });
});

describe('NotificationSoundController - sound defaults', () => {
    let controller: NotificationSoundController;

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
        controller = new NotificationSoundController(
            mockLogger,
            mockUserRepo,
            mockWsServer,
        );
    });

    describe('getSounds', () => {
        it('defaults volume/normalizationGain for sounds stored before those fields existed', async () => {
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

            const result = await controller.getSounds('u1');

            expect(result).toEqual([
                expect.objectContaining({
                    id: 's1',
                    volume: 1,
                    normalizationGain: 1,
                }),
            ]);
        });
    });

    describe('updateSound', () => {
        it('applies a valid volume patch and preserves the existing normalizationGain', async () => {
            mockUserRepo.findById.mockResolvedValue({
                snowflakeId: 'u1',
                settings: {
                    notificationSounds: [
                        {
                            id: 's1',
                            name: 'Ding',
                            url: 'http://x/s1.ogg',
                            enabled: true,
                            volume: 1,
                            normalizationGain: 2.5,
                        },
                    ],
                },
            });

            const result = await controller.updateSound('u1', 's1', {
                volume: 0.4,
            });

            expect(result).toEqual(
                expect.objectContaining({
                    id: 's1',
                    volume: 0.4,
                    normalizationGain: 2.5,
                }),
            );
            expect(mockUserRepo.updateSettings).toHaveBeenCalledWith('u1', {
                notificationSounds: [
                    expect.objectContaining({ id: 's1', volume: 0.4 }),
                ],
            });
        });
    });
});
