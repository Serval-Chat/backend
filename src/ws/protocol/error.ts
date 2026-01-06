import type { WsEvent } from "./event";

type WsErrorCode = 'AUTHENTICATION_FAILED' |
    'INTERNAL_ERROR' |
    'MALFORMED_MESSAGE' |
    'UNAUTHORIZED' |
    'DUPLICATE_MESSAGE' |
    'RATE_LIMIT' |
    'FORBIDDEN';

export interface IWsErrorEvent<
    WSEDetails = unknown
> extends WsEvent<"error", {
    code: WsErrorCode;
    details?: WSEDetails;
}> { };

function createAuthenticationFailedWsError(): IWsErrorEvent<null> {
    const e: IWsErrorEvent<null> = {
        type: "error",
        payload: {
            code: "AUTHENTICATION_FAILED",
            details: null,
        }
    };

    return e;
}