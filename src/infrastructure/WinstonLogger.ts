import { injectable } from 'inversify';
import { ILogger } from '@/di/interfaces/ILogger';
import logger from '@/utils/logger';

/**
 * Winston Logger Wrapper.
 *
 * Implements ILogger interface using the Winston logger instance.
 */
@injectable()
export class WinstonLogger implements ILogger {
    info(message: string, meta?: any): void {
        logger.info(message, meta);
    }

    error(message: string, error?: Error | any): void {
        logger.error(message, error);
    }

    warn(message: string, meta?: any): void {
        logger.warn(message, meta);
    }

    debug(message: string, meta?: any): void {
        logger.debug(message, meta);
    }
}
