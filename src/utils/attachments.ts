import { execFile } from 'child_process';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { promisify } from 'util';

import { isText } from 'istextorbinary';
import mime from 'mime-types';

import { extractOriginalFilename } from '@/config/multer';
import type {
    IMessageAttachment,
    MessageAttachmentType,
} from '@/models/Attachment';
import { getImageMetadata } from '@/utils/imageProcessing';

const execFileAsync = promisify(execFile);
const ffprobeStatic = require('ffprobe-static') as { path: string };

const KNOWN_ATTACHMENT_HOSTS = new Set([
    'kbity.catfla.re',
    'kbity.catflare.cloud',
    'rolling.catfla.re',
    'catfla.re',
    'ser.chat',
]);

const FILE_MARKER_RE = /\[%file%\]\(([^)]*)\)/g;

interface VideoProbeResult {
    streams?: {
        width?: number;
        height?: number;
    }[];
}

export function getUploadsDir(): string {
    return path.join(process.cwd(), 'uploads', 'uploads');
}

export function getStoredFilenameFromUrl(rawUrl: string): string {
    const withoutSpoiler = rawUrl.endsWith('#spoiler')
        ? rawUrl.slice(0, -'#spoiler'.length)
        : rawUrl;

    let pathname: string;
    if (withoutSpoiler.startsWith('/')) {
        pathname = withoutSpoiler;
    } else {
        const parsed = new URL(withoutSpoiler);
        if (
            KNOWN_ATTACHMENT_HOSTS.has(parsed.hostname) === false &&
            parsed.hostname !==
                new URL(process.env.SERVER_URL ?? parsed.origin).hostname
        ) {
            throw new Error(`Unknown attachment host: ${parsed.hostname}`);
        }
        pathname = parsed.pathname;
    }

    const prefixes = [
        '/api/v1/files/download/',
        '/api/v1/download/',
        '/uploads/',
    ];
    const prefix = prefixes.find((candidate) => pathname.startsWith(candidate));
    if (prefix === undefined) {
        throw new Error(`Unknown attachment download path: ${pathname}`);
    }

    const filename = decodeURIComponent(pathname.slice(prefix.length));
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename || safeFilename === '') {
        throw new Error(`Invalid attachment filename: ${filename}`);
    }

    return safeFilename;
}

export function extractLegacyFileMarkers(text: string): {
    urls: string[];
    text: string;
} {
    const urls: string[] = [];
    const nextText = text
        .replace(FILE_MARKER_RE, (_match, url: string) => {
            urls.push(url);
            return '';
        })
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();

    return { urls, text: nextText };
}

function getOriginalFilename(storedFilename: string): string {
    const isNewFormat = /^[a-f0-9]{20}-.+$/.test(storedFilename);
    return isNewFormat
        ? extractOriginalFilename(storedFilename)
        : storedFilename;
}

function getAttachmentType(
    mimeType: string,
    filename: string,
    sample: Buffer,
): MessageAttachmentType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType === 'application/json') return 'text';
    return isText(filename, sample) === true ? 'text' : 'file';
}

async function getVideoDimensions(
    filePath: string,
): Promise<{ width: number; height: number }> {
    const probeResult = (await execFileAsync(ffprobeStatic.path, [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'json',
        filePath,
    ])) as string | { stdout: string };
    const stdout =
        typeof probeResult === 'string' ? probeResult : probeResult.stdout;
    const parsed = JSON.parse(stdout) as VideoProbeResult;
    const stream = parsed.streams?.[0];
    if (
        stream?.width === undefined ||
        stream.height === undefined ||
        stream.width <= 0 ||
        stream.height <= 0
    ) {
        throw new Error(`Could not read video dimensions for ${filePath}`);
    }

    return { width: stream.width, height: stream.height };
}

export async function buildAttachmentMetadata(
    storedFilename: string,
    options: { spoiler?: boolean } = {},
): Promise<IMessageAttachment> {
    const safeFilename = path.basename(storedFilename);
    if (safeFilename !== storedFilename || safeFilename === '') {
        throw new Error(`Invalid attachment filename: ${storedFilename}`);
    }

    const filePath = path.join(getUploadsDir(), safeFilename);
    const stats = await fsPromises.stat(filePath);
    const originalName = getOriginalFilename(safeFilename);
    const originalMimeType = mime.lookup(originalName);
    const storedMimeType = mime.lookup(safeFilename);
    const detectedMimeType =
        originalMimeType !== false ? originalMimeType : storedMimeType;
    const trimmedMimeType =
        detectedMimeType !== false ? detectedMimeType.trim() : '';
    const mimeType =
        trimmedMimeType !== '' ? trimmedMimeType : 'application/octet-stream';
    const sampleSize = Math.min(4096, stats.size);
    const handle = await fsPromises.open(filePath, 'r');
    const sample = Buffer.alloc(sampleSize);
    try {
        await handle.read(sample, 0, sampleSize, 0);
    } finally {
        await handle.close();
    }

    const type = getAttachmentType(mimeType, originalName, sample);
    const attachment: IMessageAttachment = {
        attachmentId: safeFilename,
        type,
        mimeType,
        name: originalName,
        size: stats.size,
        ...(options.spoiler === true ? { spoiler: true } : {}),
    };

    if (type === 'image') {
        const metadata = (await getImageMetadata(filePath)) as {
            width?: number;
            height?: number;
        };
        if (
            metadata.width === undefined ||
            metadata.height === undefined ||
            metadata.width <= 0 ||
            metadata.height <= 0
        ) {
            throw new Error(`Could not read image dimensions for ${filePath}`);
        }
        attachment.width = metadata.width;
        attachment.height = metadata.height;
    }

    if (type === 'video') {
        const dimensions = await getVideoDimensions(filePath);
        attachment.width = dimensions.width;
        attachment.height = dimensions.height;
    }

    return attachment;
}

export async function buildAttachmentMetadataFromUrl(
    rawUrl: string,
): Promise<IMessageAttachment> {
    return buildAttachmentMetadata(getStoredFilenameFromUrl(rawUrl), {
        spoiler: rawUrl.endsWith('#spoiler'),
    });
}
