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

// Asserts a value known to be defined by construction (e.g. a field only
// ever unset on a different variant of a shared type). Throws instead of
// using the `!` non-null assertion operator.
export function assertDefined<T>(
    val: T | null | undefined,
    errorMsg: string,
): asserts val is T {
    if (val === null || val === undefined) {
        throw new ApiError(500, errorMsg);
    }
}
