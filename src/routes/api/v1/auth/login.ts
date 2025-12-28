import type { Request, Response } from 'express';
import { Router } from 'express';
import { loginLimiter } from '@/middleware/rateLimiting';
import { generateJWT } from '@/utils/jwt';
import { loginAttemptsCounter } from '@/utils/metrics';
import { validate } from '@/validation/middleware';
import { loginRequestSchema } from '@/validation/schemas/auth';
import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { AuthService } from '@/services/AuthService';

const router: Router = Router();

// POST /api/v1/login
router.post(
    '/',
    loginLimiter,
    validate({ body: loginRequestSchema }),
    async (req: Request, res: Response) => {
        const { login, password } = req.body;

        // Get AuthService from DI container
        const authService = container.get<AuthService>(TYPES.AuthService);
        const authResult = await authService.login(login, password);

        if (!authResult.success) {
            loginAttemptsCounter.labels('failure').inc();

            if (authResult.ban) {
                return res.status(403).send({
                    error: authResult.error,
                    ban: authResult.ban,
                });
            }

            return res.status(401).send({ error: authResult.error });
        }

        const user = authResult.user;

        loginAttemptsCounter.labels('success').inc();

        const token = generateJWT({
            id: user._id.toString(),
            login: user.login,
            username: user.username,
            tokenVersion: user.tokenVersion || 0,
            permissions: user.permissions,
        });

        return res.status(200).send({
            token,
            username: user.username,
        });
    },
);

export default router;
