export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeRegexSearch(input: string): string {
    return escapeRegex(input.trim().slice(0, 64));
}
