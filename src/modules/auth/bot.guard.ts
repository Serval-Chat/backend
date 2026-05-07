import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';

@Injectable()
export class IsHumanGuard implements CanActivate {
    public canActivate(context: ExecutionContext): boolean {
        const request = context
            .switchToHttp()
            .getRequest<Request & { user?: JWTPayload }>();
        const user = request.user;

        if (user?.isBot === true) {
            throw new ForbiddenException(
                'Bots are not allowed to access this endpoint',
            );
        }

        return true;
    }
}
