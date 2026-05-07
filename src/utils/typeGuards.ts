import { ApiError } from '@/utils/ApiError';
import type { NonEmptyString } from '@/types/branded';

export function isNonEmptyString(
    val: string | null | undefined,
): val is NonEmptyString {
    return val !== undefined && val !== null && val.trim() !== '';
}

export function assertNonEmptyString(
    val: string | null | undefined,
    errorMsg: string,
): asserts val is NonEmptyString {
    if (!isNonEmptyString(val)) {
        throw new ApiError(400, errorMsg);
    }
}
