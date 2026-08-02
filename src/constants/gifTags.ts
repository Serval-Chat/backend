export const TAG_NAME_MIN_LENGTH = 1;
export const TAG_NAME_MAX_LENGTH = 32;

export const TAG_NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

export const MAX_TAGS_PER_USER = 1000;
export const MAX_TAGS_PER_GIF = 25;
export const MAX_BULK_TAG_IDS = 25;

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_EXPRESSION_NESTING_DEPTH = 10;
export const MAX_EXPRESSION_TAG_TERMS = 50;

export function isValidTagName(name: string): boolean {
    return TAG_NAME_REGEX.test(name);
}
