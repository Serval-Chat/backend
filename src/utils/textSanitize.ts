// matches characters that are invisible by design: zero-width spaces/joiners,
// bidi control characters, byte-order marks, variation selectors, etc.
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;

export function stripInvisibleCharacters(input: string): string {
    return input.replace(DEFAULT_IGNORABLE_PATTERN, '');
}

export function sanitizeDisplayName(input: string): string {
    return stripInvisibleCharacters(input).trim();
}
