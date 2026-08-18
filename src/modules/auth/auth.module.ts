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
import { Reflector } from '@nestjs/core';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { JWTPayload } from '@/utils/jwt';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { IUser } from '@/models/User';
import { resolveBotAuthPayload } from '@/utils/botAuth';
import { resolveSession } from '@/utils/sessionAuth';

@Injectable()
export class AuthGuard implements CanActivate {
    public constructor(
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.BanRepository) private banRepo: IBanRepository,
        private reflector: Reflector,
    ) {}

    public async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );

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

        const resolved = await resolveSession(token);

        try {
            if (resolved !== null) {
                const user = await this.userRepo.findById(resolved.userId);

                if (!user || user.deletedAt) {
                    throw new UnauthorizedException('Invalid token');
                }

                const decoded: JWTPayload = {
                    type: 'access',
                    id: resolved.userId,
                    login: user.login ?? '',
                    username: user.username ?? '',
                    isBot: user.isBot ?? false,
                    sessionId: resolved.sessionId,
                };

                await this.banRepo.checkExpired(resolved.userId);
                const activeBan = await this.banRepo.findActiveByUserId(
                    resolved.userId,
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
                    const permissions = userPermissions as Record<
                        string,
                        boolean
                    >;
                    const hasAll =
                        permissions.adminAccess === true ||
                        requiredPermissions.every(
                            (p) => permissions[p] === true,
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
            const botPayload = await resolveBotAuthPayload(tokenHash);

            if (botPayload === null)
                throw new UnauthorizedException('Invalid token');

            if (
                requiredPermissions !== undefined &&
                requiredPermissions.length > 0
            ) {
                throw new ForbiddenException('Insufficient permissions');
            }

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
    providers: [AuthGuard],
    exports: [AuthGuard],
})
export class AuthModule {}
