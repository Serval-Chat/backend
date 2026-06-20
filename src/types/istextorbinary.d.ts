declare module 'istextorbinary' {
    export function isText(
        filename?: string | null,
        buffer?: Buffer | null,
    ): boolean | null;
    export function isBinary(
        filename?: string | null,
        buffer?: Buffer | null,
    ): boolean | null;
}
