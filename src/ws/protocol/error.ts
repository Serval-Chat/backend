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

export interface IWsErrorEvent<WSEDetails = unknown>
    extends WsEvent<
        'error',
        {
            code: WsErrorCode;
            details?: WSEDetails;
        }
    > {}
