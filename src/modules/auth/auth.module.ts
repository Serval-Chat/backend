import {
    Module,
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Reflector } from '@nestjs/core';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { JWT_SECRET } from '@/config/env';
import * as jwt from 'jsonwebtoken';
import { JWTPayload } from '@/utils/jwt';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { IUser } from '@/models/User';
import { Bot } from '@/models/Bot';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    public constructor(
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.BanRepository) private banRepo: IBanRepository,
        private reflector: Reflector,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const requiredPermissions = this.reflector.getAllAndOverride<
            string[] | undefined
        >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];
        const token =
            typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
                ? authHeader.slice('Bearer '.length).trim()
                : undefined;

        if (token === undefined) {
            throw new UnauthorizedException('No token provided');
        }

        let decoded: JWTPayload | null = null;
        try {
            const verified = jwt.verify(token, JWT_SECRET) as JWTPayload;
            if (!verified.type || verified.type === 'access')
                decoded = verified;
        } catch {}

        try {
            if (decoded !== null) {
                const user = await this.userRepo.findById(
                    new mongoose.Types.ObjectId(decoded.id),
                );

                if (!user || user.deletedAt) {
                    throw new UnauthorizedException('Invalid token');
                }

                if (
                    Number(user.tokenVersion ?? 0) !==
                    Number(decoded.tokenVersion)
                ) {
                    throw new UnauthorizedException('Token expired');
                }

                await this.banRepo.checkExpired(
                    new mongoose.Types.ObjectId(decoded.id),
                );
                const activeBan = await this.banRepo.findActiveByUserId(
                    new mongoose.Types.ObjectId(decoded.id),
                );
                if (activeBan) {
                    throw new ForbiddenException({
                        error: 'Account banned',
                        ban: {
                            reason: activeBan.reason,
                            expirationTimestamp: activeBan.expirationTimestamp,
                        },
                    });
                }

                if (
                    requiredPermissions !== undefined &&
                    requiredPermissions.length > 0
                ) {
                    const userPermissions = (user as IUser).permissions;
                    if (!userPermissions)
                        throw new ForbiddenException(
                            'Insufficient permissions',
                        );
                    const hasAll = requiredPermissions.every(
                        (p) =>
                            (
                                userPermissions as unknown as Record<
                                    string,
                                    boolean
                                >
                            )[p] === true,
                    );
                    if (!hasAll)
                        throw new ForbiddenException(
                            'Insufficient permissions',
                        );
                }

                if (request.user === undefined) request.user = decoded;
                return true;
            }

            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');
            const bot = await Bot.findOne({ botTokenHash: tokenHash })
                .select('+botTokenHash')
                .populate('userId', 'username tokenVersion deletedAt isBot')
                .lean();

            if (!bot) throw new UnauthorizedException('Invalid token');

            const botUser = bot.userId as unknown as {
                _id: mongoose.Types.ObjectId;
                username: string;
                tokenVersion: number;
                deletedAt?: Date;
                isBot: boolean;
            };

            if (botUser.deletedAt !== undefined)
                throw new UnauthorizedException('Invalid token');

            const botPayload: JWTPayload = {
                type: 'access',
                id: botUser._id.toString(),
                login: `bot.${bot.clientId}`,
                username: botUser.username,
                tokenVersion: botUser.tokenVersion,
                isBot: true,
            };

            if (request.user === undefined) request.user = botPayload;
            return true;
        } catch (err: unknown) {
            if (
                err instanceof UnauthorizedException ||
                err instanceof ForbiddenException
            ) {
                throw err;
            }
            throw new UnauthorizedException('Invalid token');
        }
    }
}

@Module({
    providers: [JwtAuthGuard],
    exports: [JwtAuthGuard],
})
export class AuthModule {}
