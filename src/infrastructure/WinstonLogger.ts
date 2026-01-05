import { Injectable } from '@nestjs/common';
import { ILogger } from '@/di/interfaces/ILogger';
import logger from '@/utils/logger';

import { injectable } from 'inversify';

// Winston logger wrapper
//
// Implements ILogger interface using the Winston logger instance
@injectable()
@Injectable()
export class WinstonLogger implements ILogger {
    info(message: string, meta?: Record<string, unknown>): void {
        logger.info(message, meta);
    }

    error(message: string, error?: Error | unknown): void {
        logger.error(message, error);
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        logger.warn(message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        logger.debug(message, meta);
    }
}
