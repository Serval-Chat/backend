import type { Request, Response } from 'express';
import { Router } from 'express';
import { registrationLimiter } from '../../../../middleware/rateLimiting';
import fs from 'fs';
import path from 'path';
import { container } from '../../../../di/container';
import { TYPES } from '../../../../di/types';
import type { IUserRepository } from '../../../../di/interfaces/IUserRepository';
import { generateJWT } from '../../../../utils/jwt';
import {
    registrationAttemptsCounter,
    usersCreatedCounter,
} from '../../../../utils/metrics';
import { validate } from '../../../../validation/middleware';
import { registerSchema } from '../../../../validation/schemas/auth';

const router: Router = Router();

// DI Repository instance
const userRepo = container.get<IUserRepository>(TYPES.UserRepository);

// POST /api/v1/register
router.post(
    '/',
    registrationLimiter,
    validate({ body: registerSchema }),
    async (req: Request, res: Response) => {
        const { login, username, password, invite } = req.body;

        // Read tokens.txt
        let tokens: string[];
        try {
            const file = fs.readFileSync(path.join('tokens.txt'), 'utf-8');
            tokens = file
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean);
        } catch {
            registrationAttemptsCounter.labels('failure').inc();
            return res.status(500).send({ error: 'cannot read tokens file' });
        }

        // Check invite
        if (!tokens.includes(invite)) {
            registrationAttemptsCounter.labels('failure').inc();
            return res.status(403).send({ error: 'invalid invite token' });
        }

        // Check if login exists
        const existingLogin = await userRepo.findByLogin(login);
        if (existingLogin) {
            registrationAttemptsCounter.labels('failure').inc();
            return res.status(400).send({ error: 'login already exists' });
        }

        // Check if username exists
        const existingUsername = await userRepo.findByUsername(username);
        if (existingUsername) {
            registrationAttemptsCounter.labels('failure').inc();
            return res.status(400).send({ error: 'username already exists' });
        }

        // Create user
        const user = await userRepo.create({ login, username, password });

        registrationAttemptsCounter.labels('success').inc();
        usersCreatedCounter.inc();

        // Remove used invite from file
        const updatedTokens = tokens.filter((t) => t !== invite);
        fs.writeFileSync(
            'tokens.txt' /* todo: make it an environment variable. */,
            updatedTokens.join('\n'),
        );

        const newUser = await userRepo.findByLogin(login);
        if (!newUser) throw new Error('User just created but not found');

        const token = generateJWT({
            id: newUser._id.toString(),
            login: newUser.login!,
            username: newUser.username!,
            tokenVersion: newUser.tokenVersion || 0,
            permissions: newUser.permissions,
        });
        res.status(200).send({ token });
    },
);

export default router;
