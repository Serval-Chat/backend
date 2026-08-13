import type { WsEvent } from './event';

export type WsErrorCode =
    | 'AUTHENTICATION_FAILED'
    | 'INTERNAL_ERROR'
    | 'MALFORMED_MESSAGE'
    | 'UNAUTHORIZED'
    | 'DUPLICATE_MESSAGE'
    | 'RATE_LIMIT'
    | 'TIMEOUT'
    | 'FORBIDDEN'
    | 'BAD_REQUEST'
    | 'NOT_FOUND'
    | 'CONFLICT';

const STATUS_TO_CODE: Record<number, WsErrorCode> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    429: 'RATE_LIMIT',
};

export function wsErrorCodeForStatus(status: number): WsErrorCode {
    return STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
}

export interface IWsErrorEvent<WSEDetails = unknown> extends WsEvent<
    'error',
    {
        code: WsErrorCode;
        details?: WSEDetails;
    }
> {}
