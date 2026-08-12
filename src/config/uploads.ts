import path from 'path';

export const UPLOAD_ROOT = 'uploads';

export const UPLOAD_SUBDIRS = [
    'uploads',
    'profiles',
    'banners',
    'servers',
    'webhooks',
    'emojis',
    'stickers',
    'sounds',
] as const;

export const UPLOAD_DIRS = [
    UPLOAD_ROOT,
    ...UPLOAD_SUBDIRS.map((dir) => path.posix.join(UPLOAD_ROOT, dir)),
];

export function uploadPath(subdir: (typeof UPLOAD_SUBDIRS)[number]): string {
    return path.join(process.cwd(), UPLOAD_ROOT, subdir);
}
