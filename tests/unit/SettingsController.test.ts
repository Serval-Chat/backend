/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Types } from 'mongoose';
import { SettingsController } from '../../src/controllers/SettingsController';
import { createTestUser, createMockRequest } from '../utils/test-utils';

describe('SettingsController', () => {
    let mockUserRepo: Record<string, jest.Mock>;
    let mockLogger: Record<string, jest.Mock>;
    let mockWsServer: Record<string, jest.Mock>;
    let controller: SettingsController;

    beforeEach(() => {
        mockUserRepo = {
            findById: jest.fn(),
            updateSettings: jest.fn(),
        };
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
        };
        mockWsServer = {
            broadcastToUser: jest.fn(),
        };

        controller = new SettingsController(
            mockUserRepo as any,
            mockLogger as any,
            mockWsServer as any,
        );
    });

    describe('getSettings', () => {
        it('should return user settings including custom font fields', async () => {
            const userId = new Types.ObjectId();
            const mockUser = createTestUser({
                _id: userId,
                settings: {
                    muteNotifications: true,
                    customFontUrl: 'https://fonts.googleapis.com/css2?family=Roboto',
                    customFontFamily: 'Roboto',
                },
            });

            (mockUserRepo.findById as jest.Mock).mockResolvedValue(mockUser);

            const mockReq = createMockRequest({
                user: { id: userId.toString() },
            });

            const result = await controller.getSettings(mockReq.user?.id as string);
            const settings = result;

            expect(settings).toMatchObject({
                muteNotifications: true,
                customFontUrl: 'https://fonts.googleapis.com/css2?family=Roboto',
                customFontFamily: 'Roboto',
            });
        });

        it('should return default settings if user settings are missing', async () => {
            const userId = new Types.ObjectId();
            const mockUser = createTestUser({
                _id: userId,
                settings: undefined,
            });

            (mockUserRepo.findById as jest.Mock).mockResolvedValue(mockUser);

            const mockReq = createMockRequest({
                user: { id: userId.toString() },
            });

            const result = await controller.getSettings(mockReq.user?.id as string);

            expect(result).toMatchObject({
                customFontUrl: '',
                customFontFamily: '',
                muteNotifications: false,
            });
        });
    });

    describe('updateSettings', () => {
        it('should update settings and broadcast the change', async () => {
            const userId = new Types.ObjectId();
            const mockUser = createTestUser({ _id: userId });
            const updatePayload = {
                customFontUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans',
                customFontFamily: 'Open Sans',
            };

            (mockUserRepo.findById as jest.Mock).mockResolvedValueOnce(mockUser);
            (mockUserRepo.findById as jest.Mock).mockResolvedValueOnce({
                ...mockUser,
                settings: updatePayload,
            }); // After update

            const mockReq = createMockRequest({
                user: { id: userId.toString() },
            });

            const result = await controller.updateSettings(mockReq.user?.id as string, updatePayload);

            expect(mockUserRepo.updateSettings).toHaveBeenCalledWith(
                userId.toString(),
                updatePayload,
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                userId.toString(),
                expect.objectContaining({
                    type: 'user_updated',
                    payload: expect.objectContaining({
                        settings: expect.objectContaining(updatePayload),
                    }),
                }),
            );
            expect(result.settings).toMatchObject(updatePayload);
        });
    });
});
