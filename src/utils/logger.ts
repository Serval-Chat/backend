import { createLogger, format, transports } from 'winston';
import { PROJECT_LEVEL, LOGS_PATH } from '@/config/env';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';
const { combine, timestamp, printf, colorize, errors } = format;

/**
 * Log format with timestamp and error stack traces.
 */
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

/**
 * Winston logger instance.
 * At production level, only info and error logs are logged.
 * At development level, debug and error logs are logged.
 * Max size of log file is 20MB, and it is rotated daily.
 *
 */
const logger = createLogger({
    level: PROJECT_LEVEL === 'production' ? 'info' : 'debug',
    format: combine(
        timestamp(),
        errors({ stack: true }), // log error stack too
        logFormat,
    ),
    transports: [
        new transports.Console({
            format: combine(colorize(), timestamp(), logFormat),
        }),
    ],
    defaultMeta: { service: 'chat-server' },
});

logger.add(
    new DailyRotateFile({
        filename: path.join(LOGS_PATH, 'app-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        zippedArchive: true,
        maxSize: '20m',
    }),
);

export default logger;
