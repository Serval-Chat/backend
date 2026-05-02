import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import type { Request as ExpressRequest } from 'express';

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

function fileFilter(
  req: ExpressRequest,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  cb(null, true);
}

export const upload = multer({
  storage,
  limits: {
    fileSize: 60 * 1024 * 1024 + 1, // +1 to avoid edge-case rejection at exactly 60MiB
    files: 1,
  },
  fileFilter,
});

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
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

const profileFileFilter = (
  req: ExpressRequest,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
  }
};

export const profilePictureUpload = multer({
  storage: profileStorage,
  fileFilter: profileFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024 + 1, // +1 to avoid edge-case rejection at exactly 60MiB
    files: 1,
  },
});