import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { JWTPayload } from '@/utils/jwt';

export const CurrentUser = createParamDecorator(
    (field: keyof JWTPayload | undefined, ctx: ExecutionContext) => {
        const request = ctx
            .switchToHttp()
            .getRequest<Request & { user: JWTPayload }>();
        return field ? request.user[field] : request.user;
    },
);
