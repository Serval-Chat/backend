export const STICKER_NAME_MIN_LENGTH = 1;
export const STICKER_NAME_MAX_LENGTH = 56;
export const STICKER_MAX_WIDTH = 512;
export const STICKER_MAX_HEIGHT = 512;
export const STICKER_MIN_WIDTH = 64;
export const STICKER_MIN_HEIGHT = 64;
export const STICKER_MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Allows any character except control characters and newlines
export const STICKER_NAME_REGEX = /^[^\p{Cc}\p{Cn}\p{Cs}]+$/u;
export const INVALID_STICKER_NAME_CHARS_REGEX = /[\p{Cc}\p{Cn}\p{Cs}]/gu;

export function isValidStickerName(name: string): boolean {
    if (!name) return false;
    const trimmed = name.trim();
    return (
        trimmed.length >= STICKER_NAME_MIN_LENGTH &&
        trimmed.length <= STICKER_NAME_MAX_LENGTH &&
        STICKER_NAME_REGEX.test(trimmed)
    );
}
