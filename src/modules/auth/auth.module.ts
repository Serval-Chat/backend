import { Module, Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { JWT_SECRET } from '@/config/env';
import * as jwt from 'jsonwebtoken';
import { JWTPayload } from '@/utils/jwt';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { IUser } from '@/models/User';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.BanRepository) private banRepo: IBanRepository,
        private reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers['authorization'];
        const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
            ? authHeader.slice('Bearer '.length).trim()
            : undefined;

        if (!token) {
            throw new UnauthorizedException('No token provided');
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

            // Check if account is deleted and validate tokenVersion
            const user = await this.userRepo.findById(decoded.id);

            if (!user || user.deletedAt) {
                throw new UnauthorizedException('Invalid token');
            }

            // Validate tokenVersion
            if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
                throw new UnauthorizedException('Token expired');
            }

            // Check for bans
            await this.banRepo.checkExpired(decoded.id);
            const activeBan = await this.banRepo.findActiveByUserId(decoded.id);
            if (activeBan) {
                throw new ForbiddenException({
                    error: 'Account banned',
                    ban: {
                        reason: activeBan.reason,
                        expirationTimestamp: activeBan.expirationTimestamp,
                    },
                });
            }

            // Check permissions if required
            if (requiredPermissions && requiredPermissions.length > 0) {
                const userPermissions = (user as IUser).permissions;
                if (!userPermissions) {
                    throw new ForbiddenException('Insufficient permissions');
                }

                const hasAllPermissions = requiredPermissions.every(
                    (p) => (userPermissions as unknown as Record<string, boolean>)[p] === true,
                );

                if (!hasAllPermissions) {
                    throw new ForbiddenException('Insufficient permissions');
                }
            }

            if (!request.user) {
                request.user = decoded;
            }
            return true;
        } catch (err: unknown) {
            if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
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
export class AuthModule { }

