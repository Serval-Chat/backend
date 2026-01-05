import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import type { Request as ExpressRequest } from 'express';

// Sanitizes filenames by removing path separators, null bytes, and dots. Limits to 200 chars
function sanitizeFilename(filename: string): string {
    // Remove path separators and null bytes
    let sanitized = filename.replace(/[/\\:\0]/g, '_');
    // Replace spaces with underscores
    sanitized = sanitized.replace(/\s+/g, '_');
    // Remove leading dots to prevent hidden files
    sanitized = sanitized.replace(/^\.+/, '');

    if (sanitized.length > 200) {
        const ext = path.extname(sanitized);
        const base = path.basename(sanitized, ext);
        sanitized = base.substring(0, 200 - ext.length) + ext;
    }
    return sanitized || 'file';
}

// Generates unique filename with random prefix
function generateSecureFilename(originalname: string): string {
    const randomPrefix = crypto.randomBytes(10).toString('hex');
    const sanitized = sanitizeFilename(originalname);
    return `${randomPrefix}-${sanitized}`;
}

// Extracts original filename from prefixed format
export function extractOriginalFilename(secureFilename: string): string {
    const match = secureFilename.match(/^[a-f0-9]{20}-(.+)$/);
    return match?.[1] ?? secureFilename;
}

// Disk storage for general file uploads
export const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), 'uploads', 'uploads'));
    },
    filename: (req, file, cb) => {
        const secureFilename = generateSecureFilename(file.originalname);
        cb(null, secureFilename);
    },
});

// Accepts all file types. Type validation occurs downstream
function fileFilter(
    req: ExpressRequest,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
) {
    cb(null, true);
}

// General file upload handler. Max size: 60MiB, 1 file
export const upload = multer({
    storage,
    limits: {
        fileSize: 60 * 1024 * 1024 + 1, // +1 to avoid edge-case rejection at exactly 60MiB
        files: 1,
    },
    fileFilter,
});

// Disk storage for profile pictures with randomized filenames
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
        const fs = require('fs');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const randomName = crypto.randomBytes(16).toString('hex');
        cb(null, `${randomName}${ext}`);
    },
});

// Restricts to JPEG, PNG, and GIF formats
const profileFileFilter = (
    req: ExpressRequest,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                'Invalid file type. Only JPEG, PNG, and GIF are allowed.',
            ),
        );
    }
};

// Profile picture upload handler. Max size: 10MiB, 1 file
export const profilePictureUpload = multer({
    storage: profileStorage,
    fileFilter: profileFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
});

// Memory storage for image processing (e.g., Sharp)
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 60 * 1024 * 1024 + 1, // +1 to avoid edge-case rejection at exactly 60MiB
        files: 1,
    },
});
