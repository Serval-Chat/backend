import type { Request, Response, NextFunction } from 'express';
import express, { Router } from 'express';
import { upload, extractOriginalFilename } from '@/config/multer';
import { authenticateToken } from '@/middleware/auth';
import logger from '@/utils/logger';
import { SERVER_URL } from '@/config/env';
import path from 'path';
import fs from 'fs';
import { validate } from '@/validation/middleware';
import { fileParamSchema } from '@/validation/schemas/upload';

const router: Router = Router();

// POST /api/v1/files/upload
router.post(
    '/upload',
    authenticateToken,
    (req: Request, res: Response, next: NextFunction) => {
        upload.single('file')(req, res, (err: any) => {
            if (err) {
                // Handle multer errors
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res
                        .status(400)
                        .json({ error: 'File size exceeds 50MB limit' });
                }
                if (err.message) {
                    return res.status(400).json({ error: err.message });
                }
                return res.status(500).json({ error: 'File upload failed' });
            }

            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // Return download URL instead of direct static URL
            const fileUrl = `${SERVER_URL}/api/v1/download/${req.file.filename}`;
            res.json({ url: fileUrl });
        });
    },
);

// GET /api/v1/files/file-metadata/:filename
router.get(
    '/file-metadata/:filename',
    validate({ params: fileParamSchema }),
    async (req: Request, res: Response) => {
        try {
            const filename = req.params.filename;

            if (!filename) {
                return res.status(400).json({ error: 'Filename required' });
            }

            // Security: Use path.basename to prevent directory traversal
            // This strips any path components, ensuring only the filename is used
            const safeFilename = path.basename(filename);

            // Additional validation: reject if basename differs from input
            if (safeFilename !== filename) {
                return res.status(400).json({ error: 'Invalid filename' });
            }

            // Use absolute path from project root
            const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
            const filePath = path.join(uploadsDir, safeFilename);

            // Security: Verify the resolved path is still within uploads directory
            const realPath = fs.realpathSync(filePath);
            if (!realPath.startsWith(uploadsDir)) {
                return res.status(400).json({ error: 'Invalid file path' });
            }

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Get file stats
            const stats = fs.statSync(filePath);

            // Check if it's new format (20 hex chars + hyphen) or old format
            const isNewFormat = /^[a-f0-9]{20}-.+$/.test(filename);
            const originalFilename = isNewFormat
                ? extractOriginalFilename(filename)
                : filename;

            // Detect if file is binary by checking for null bytes in first 8KB
            let isBinary = false;
            try {
                const buffer = Buffer.alloc(Math.min(8192, stats.size));
                const fd = fs.openSync(filePath, 'r');
                fs.readSync(fd, buffer, 0, buffer.length, 0);
                fs.closeSync(fd);

                // Assume binary if null bytes are found
                isBinary = buffer.includes(0);
            } catch (err) {
                logger.error('Error detecting binary:', err);
                // If detection fails, assume binary
                isBinary = true;
            }

            // Determine mime type based on extension
            const ext = path.extname(originalFilename).toLowerCase();
            let mimeType = 'application/octet-stream';

            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.svg') mimeType = 'image/svg+xml';
            else if (ext === '.mp4') mimeType = 'video/mp4';
            else if (ext === '.webm') mimeType = 'video/webm';
            else if (ext === '.mp3') mimeType = 'audio/mpeg';
            else if (ext === '.wav') mimeType = 'audio/wav';
            else if (ext === '.pdf') mimeType = 'application/pdf';
            else if (ext === '.txt') mimeType = 'text/plain';

            // Return metadata
            res.json({
                filename: originalFilename,
                size: stats.size,
                isBinary,
                mimeType,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
            });
        } catch (err) {
            logger.error('Metadata error:', err);
            res.status(500).json({ error: 'Failed to get file metadata' });
        }
    },
);

// GET /api/v1/files/download/:filename
router.get(
    '/download/:filename',
    validate({ params: fileParamSchema }),
    async (req: Request, res: Response) => {
        try {
            const filename = req.params.filename;

            if (!filename) {
                return res.status(400).json({ error: 'Filename required' });
            }

            // Use path.basename to prevent directory traversal
            const safeFilename = path.basename(filename);

            // Additional validation: reject if basename differs from input
            if (safeFilename !== filename) {
                return res.status(400).json({ error: 'Invalid filename' });
            }

            // Use absolute path from project root
            const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
            const filePath = path.join(uploadsDir, safeFilename);

            // Security: Verify the resolved path is still within uploads directory
            const realPath = fs.realpathSync(filePath);
            if (!realPath.startsWith(uploadsDir)) {
                return res.status(400).json({ error: 'Invalid file path' });
            }

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Check if it's new format (20 hex chars + hyphen) or old format
            const isNewFormat = /^[a-f0-9]{20}-.+$/.test(safeFilename);
            const originalFilename = isNewFormat
                ? extractOriginalFilename(safeFilename)
                : safeFilename;

            // Escape filename for Content-Disposition header
            const escapedFilename = originalFilename.replace(/["\\]/g, '\\$&');
            const encodedFilename = encodeURIComponent(originalFilename);

            // Set headers for download with original filename
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${escapedFilename}"; filename*=UTF-8''${encodedFilename}`,
            );

            // Determine content type based on extension
            const ext = path.extname(originalFilename).toLowerCase();
            let contentType = 'application/octet-stream';

            if (ext === '.png') contentType = 'image/png';
            else if (ext === '.jpg' || ext === '.jpeg')
                contentType = 'image/jpeg';
            else if (ext === '.gif') contentType = 'image/gif';
            else if (ext === '.webp') contentType = 'image/webp';
            else if (ext === '.svg') contentType = 'image/svg+xml';
            else if (ext === '.mp4') contentType = 'video/mp4';
            else if (ext === '.webm') contentType = 'video/webm';
            else if (ext === '.mp3') contentType = 'audio/mpeg';
            else if (ext === '.wav') contentType = 'audio/wav';
            else if (ext === '.pdf') contentType = 'application/pdf';
            else if (ext === '.txt') contentType = 'text/plain';

            res.setHeader('Content-Type', contentType);

            // Stream the file
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        } catch (err) {
            logger.error('Download error:', err);
            res.status(500).json({ error: 'Failed to download file' });
        }
    },
);

export default router;
