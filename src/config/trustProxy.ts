export function resolveTrustProxy(
    value: string | undefined,
): boolean | number | string {
    if (value === undefined || value === '') return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    return value;
}
