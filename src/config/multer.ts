import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export const genericFileUploadLimits: NonNullable<MulterOptions['limits']> = {
    fileSize: 60 * 1024 * 1024 + 1, // +1 to avoid edge-case rejection at exactly 60MiB
    files: 1,
};

export const imageUploadLimits: NonNullable<MulterOptions['limits']> = {
    fileSize: 5 * 1024 * 1024,
    files: 1,
};

export const emojiUploadLimits: NonNullable<MulterOptions['limits']> = {
    fileSize: 10 * 1024 * 1024,
    files: 1,
};

function sanitizeFilename(filename: string): string {
    let sanitized = filename.replace(/[/\\:\0]/g, '_');
    sanitized = sanitized.replace(/\s+/g, '_');
    sanitized = sanitized.replace(/^\.+/, '');
    if (sanitized.length > 200) {
        const ext = path.extname(sanitized);
        const base = path.basename(sanitized, ext);
        sanitized = base.substring(0, 200 - ext.length) + ext;
    }
    return sanitized || 'file';
}

function generateSecureFilename(originalname: string): string {
    const randomPrefix = crypto.randomBytes(10).toString('hex');
    const sanitized = sanitizeFilename(originalname);
    return `${randomPrefix}-${sanitized}`;
}

export function extractOriginalFilename(secureFilename: string): string {
    const match = secureFilename.match(/^[a-f0-9]{20}-(.+)$/);
    return match?.[1] ?? secureFilename;
}

export const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), 'uploads', 'uploads'));
    },
    filename: (req, file, cb) => {
        const secureFilename = generateSecureFilename(file.originalname);
        cb(null, secureFilename);
    },
});

export const imageFileFilter: NonNullable<MulterOptions['fileFilter']> = (
    req,
    file,
    cb,
) => {
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                'Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.',
            ),
            false,
        );
    }
};
