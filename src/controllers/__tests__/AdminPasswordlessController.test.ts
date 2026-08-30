import type { AuthenticatedRequest } from '@/middleware/auth';
import { AdminPasswordlessController } from '../AdminPasswordlessController';

describe('AdminPasswordlessController', () => {
    let controller: AdminPasswordlessController;
    const passwordlessService = {
        adminReset: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AdminPasswordlessController(
            passwordlessService as never,
        );
    });

    it('delegates to the service with the actor id from the session and the target user id from the route', async () => {
        passwordlessService.adminReset.mockResolvedValue('TEMP-PASS-1');
        const req = {
            user: { id: 'admin-1' },
        } as unknown as AuthenticatedRequest;

        const result = await controller.reset('user-1', req);

        expect(passwordlessService.adminReset).toHaveBeenCalledWith(
            'admin-1',
            'user-1',
        );
        expect(result).toEqual({
            message: expect.any(String),
            temporaryPassword: 'TEMP-PASS-1',
        });
    });
});
