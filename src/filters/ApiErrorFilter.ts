import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { ApiError } from '@/utils/ApiError';
import { PROJECT_LEVEL } from '@/config/env';

@Catch(ApiError)
export class ApiErrorFilter implements ExceptionFilter {
    catch(exception: ApiError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const status = exception.status;

        response
            .status(status)
            .json({
                error: exception.message,
                details: exception.details,
                ...(PROJECT_LEVEL !== 'production' && { stack: exception.stack }),
            });
    }
}
