import { execFile } from 'child_process';
import { promises as fsPromises } from 'fs';
import path from 'path';

import sharp from 'sharp';

jest.mock('child_process', () => ({
    execFile: jest.fn(
        (
            _binary: string,
            _args: string[],
            callback: (
                error: Error | null,
                stdout: string,
                stderr: string,
            ) => void,
        ) => {
            callback(
                null,
                JSON.stringify({ streams: [{ width: 640, height: 360 }] }),
                '',
            );
        },
    ),
}));

import type { IMessageAttachment } from '@/models/Attachment';

import {
    buildAttachmentMetadata,
    buildAttachmentMetadataFromUrl,
    embedAttachmentContentForMessages,
    extractLegacyFileMarkers,
    getUploadsDir,
    MAX_INLINE_ATTACHMENT_CONTENT_BYTES,
} from './attachments';

const mockedExecFile = jest.mocked(execFile);

describe('attachment metadata helpers', () => {
    const uploadsDir = getUploadsDir();
    const createdFiles: string[] = [];

    beforeEach(async () => {
        mockedExecFile.mockClear();
        createdFiles.length = 0;
        await fsPromises.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await Promise.all(
            createdFiles.map((filename) =>
                fsPromises.rm(path.join(uploadsDir, filename), {
                    force: true,
                }),
            ),
        );
    });

    it('builds image metadata with dimensions', async () => {
        const filename = '0123456789abcdef0123-pixel.png';
        createdFiles.push(filename);
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
        );
        await fsPromises.writeFile(path.join(uploadsDir, filename), png);

        const attachment = await buildAttachmentMetadata(filename);

        expect(attachment).toMatchObject({
            attachmentId: filename,
            type: 'image',
            mimeType: 'image/png',
            name: 'pixel.png',
            width: 1,
            height: 1,
        });

        const writtenStats = await fsPromises.stat(
            path.join(uploadsDir, filename),
        );
        expect(attachment.size).toBe(writtenStats.size);
    });

    it('strips EXIF/GPS metadata from uploaded photos', async () => {
        const filename = 'gps-photo.jpg';
        createdFiles.push(filename);
        // 8x8 JPEG with GPS EXIF data embedded via exiftool.
        const jpegWithGpsExif = Buffer.from(
            '/9j/4AAQSkZJRgABAQAAAAAAAAD/4QDURXhpZgAATU0AKgAAAAgABQEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAEAAAITAAMAAAABAAEAAIglAAQAAAABAAAAWgAAAAAAAAAAAAAAAQAAAAAAAAABAAUAAAABAAAABAIDAAAAAQACAAAAAk4AAAAAAgAFAAAAAwAAAJwAAwACAAAAAlcAAAAABAAFAAAAAwAAALQAAAAAAAAAKAAAAAEAAAAaAAAAAQAAAo4AAAAZAAAATwAAAAEAAAA7AAAAAQAABGsAAAAZ/9sAQwADAgICAgIDAgICAwMDAwQGBAQEBAQIBgYFBgkICgoJCAkJCgwPDAoLDgsJCQ0RDQ4PEBAREAoMEhMSEBMPEBAQ/9sAQwEDAwMEAwQIBAQIEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/8AAEQgACAAIAwERAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA6AxVN/9k=',
            'base64',
        );
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            jpegWithGpsExif,
        );

        await buildAttachmentMetadata(filename);

        const written = await fsPromises.readFile(
            path.join(uploadsDir, filename),
        );
        const metadata = await sharp(written).metadata();
        expect(metadata.exif).toBeUndefined();
    });

    it('sanitizes <script> tags out of uploaded SVGs', async () => {
        const filename = 'evil.svg';
        createdFiles.push(filename);
        const maliciousSvg =
            '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><circle cx="5" cy="5" r="4"/></svg>';
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            maliciousSvg,
        );

        await buildAttachmentMetadata(filename);

        const written = await fsPromises.readFile(
            path.join(uploadsDir, filename),
            'utf8',
        );
        expect(written).not.toContain('<script');
        expect(written).not.toContain('onload');
        expect(written).toContain('<circle');
    });

    it('accepts an image without dimensions when sharp cannot decode it (e.g. .bmp/.ico are unsupported by libvips)', async () => {
        const filename = 'icon.bmp';
        createdFiles.push(filename);
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            'not-a-real-bitmap',
        );

        const result = await buildAttachmentMetadata(filename);

        expect(result).toMatchObject({
            attachmentId: filename,
            type: 'image',
            mimeType: 'image/bmp',
            name: filename,
        });
        expect(result.width).toBeUndefined();
        expect(result.height).toBeUndefined();
    });

    it('builds video metadata with ffprobe dimensions', async () => {
        const filename = 'clip.mp4';
        createdFiles.push(filename);
        await fsPromises.writeFile(path.join(uploadsDir, filename), 'not-real');

        await expect(buildAttachmentMetadata(filename)).resolves.toMatchObject({
            attachmentId: filename,
            type: 'video',
            mimeType: 'video/mp4',
            name: filename,
            width: 640,
            height: 360,
        });
        expect(mockedExecFile).toHaveBeenCalled();
    });

    it('rejects videos when dimensions cannot be read', async () => {
        mockedExecFile.mockImplementationOnce(((
            _binary: string,
            _args: string[],
            callback: (
                error: Error | null,
                stdout: string,
                stderr: string,
            ) => void,
        ) => {
            callback(null, JSON.stringify({ streams: [{}] }), '');
        }) as never);
        const filename = 'bad.mp4';
        createdFiles.push(filename);
        await fsPromises.writeFile(path.join(uploadsDir, filename), 'not-real');

        await expect(buildAttachmentMetadata(filename)).rejects.toThrow(
            'Could not read video dimensions',
        );
    });

    it('classifies .ts files as text instead of video (mime-types maps .ts to video/mp2t)', async () => {
        const filename = 'main.ts';
        createdFiles.push(filename);
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            "const x: string = 'hi';",
        );

        await expect(buildAttachmentMetadata(filename)).resolves.toMatchObject({
            attachmentId: filename,
            type: 'text',
            mimeType: 'text/typescript',
            name: filename,
        });
        expect(mockedExecFile).not.toHaveBeenCalled();
    });

    it('parses legacy file markers and preserves spoiler metadata', async () => {
        const filename = 'note.txt';
        createdFiles.push(filename);
        await fsPromises.writeFile(path.join(uploadsDir, filename), 'hello');

        const legacy = `hello\n[%file%](https://ser.chat/api/v1/files/download/${filename}#spoiler)\nworld`;
        expect(extractLegacyFileMarkers(legacy)).toEqual({
            urls: [
                `https://ser.chat/api/v1/files/download/${filename}#spoiler`,
            ],
            text: 'hello\nworld',
        });

        await expect(
            buildAttachmentMetadataFromUrl(
                `https://ser.chat/api/v1/files/download/${filename}#spoiler`,
            ),
        ).resolves.toMatchObject({
            attachmentId: filename,
            type: 'text',
            spoiler: true,
        });
    });

    it('accepts legacy /uploads download paths', async () => {
        const filename = '3ca5120f6d9159a80147de12d92d8813.iso';
        createdFiles.push(filename);
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            Buffer.from([0, 1, 2, 3]),
        );

        await expect(
            buildAttachmentMetadataFromUrl(
                `https://kbity.catflare.cloud/uploads/${filename}`,
            ),
        ).resolves.toMatchObject({
            attachmentId: filename,
            type: 'file',
            name: filename,
        });
    });
});

describe('embedAttachmentContentForMessages', () => {
    const uploadsDir = getUploadsDir();
    const createdFiles: string[] = [];

    beforeEach(async () => {
        createdFiles.length = 0;
        await fsPromises.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await Promise.all(
            createdFiles.map((filename) =>
                fsPromises.rm(path.join(uploadsDir, filename), {
                    force: true,
                }),
            ),
        );
    });

    it('embeds content for every qualifying attachment across multiple messages, not just the last one', async () => {
        const files = ['multi-a.txt', 'multi-b.txt', 'multi-c.txt'];
        for (const filename of files) {
            createdFiles.push(filename);
            await fsPromises.writeFile(
                path.join(uploadsDir, filename),
                `content of ${filename}`,
            );
        }

        const attachmentsByFile = new Map<string, IMessageAttachment>(
            files.map((filename) => [
                filename,
                {
                    attachmentId: filename,
                    type: 'text',
                    mimeType: 'text/plain',
                    name: filename,
                    size: 20,
                },
            ]),
        );
        const messages = files.map((filename) => {
            const attachment = attachmentsByFile.get(filename);
            if (!attachment) throw new Error('unreachable');
            return { attachments: [attachment] };
        });

        await embedAttachmentContentForMessages(messages);

        for (const filename of files) {
            expect(attachmentsByFile.get(filename)?.content).toBe(
                `content of ${filename}`,
            );
        }
    });

    it('embeds content for multiple attachments within the same message', async () => {
        const filenameA = 'same-msg-a.txt';
        const filenameB = 'same-msg-b.txt';
        createdFiles.push(filenameA, filenameB);
        await fsPromises.writeFile(
            path.join(uploadsDir, filenameA),
            'content of same-msg-a.txt',
        );
        await fsPromises.writeFile(
            path.join(uploadsDir, filenameB),
            'content of same-msg-b.txt',
        );

        const attachmentA: IMessageAttachment = {
            attachmentId: filenameA,
            type: 'text',
            mimeType: 'text/plain',
            name: filenameA,
            size: 20,
        };
        const attachmentB: IMessageAttachment = {
            attachmentId: filenameB,
            type: 'text',
            mimeType: 'text/plain',
            name: filenameB,
            size: 20,
        };

        await embedAttachmentContentForMessages([
            { attachments: [attachmentA, attachmentB] },
        ]);

        expect(attachmentA.content).toBe('content of same-msg-a.txt');
        expect(attachmentB.content).toBe('content of same-msg-b.txt');
    });

    it('embeds content for a small text attachment', async () => {
        const filename = 'small.txt';
        createdFiles.push(filename);
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            'hello world',
        );

        const attachment: IMessageAttachment = {
            attachmentId: filename,
            type: 'text',
            mimeType: 'text/plain',
            name: filename,
            size: 11,
        };

        await embedAttachmentContentForMessages([
            { attachments: [attachment] },
        ]);

        expect(attachment.content).toBe('hello world');
    });

    it('does not embed content for non-text attachments', async () => {
        const filename = 'image.png';
        createdFiles.push(filename);
        await fsPromises.writeFile(
            path.join(uploadsDir, filename),
            'not actually a png',
        );

        const attachment: IMessageAttachment = {
            attachmentId: filename,
            type: 'image',
            mimeType: 'image/png',
            name: filename,
            size: 18,
        };

        await embedAttachmentContentForMessages([
            { attachments: [attachment] },
        ]);

        expect(attachment.content).toBeUndefined();
    });

    it('does not embed content for text attachments at or over the size threshold', async () => {
        const filename = 'big.txt';
        createdFiles.push(filename);
        await fsPromises.writeFile(path.join(uploadsDir, filename), 'x');

        const attachment: IMessageAttachment = {
            attachmentId: filename,
            type: 'text',
            mimeType: 'text/plain',
            name: filename,
            size: MAX_INLINE_ATTACHMENT_CONTENT_BYTES,
        };

        await embedAttachmentContentForMessages([
            { attachments: [attachment] },
        ]);

        expect(attachment.content).toBeUndefined();
    });

    it('leaves content undefined without throwing when the underlying file is missing', async () => {
        const attachment: IMessageAttachment = {
            attachmentId: 'does-not-exist.txt',
            type: 'text',
            mimeType: 'text/plain',
            name: 'does-not-exist.txt',
            size: 10,
        };

        await expect(
            embedAttachmentContentForMessages([{ attachments: [attachment] }]),
        ).resolves.toBeUndefined();
        expect(attachment.content).toBeUndefined();
    });

    it('handles messages with no attachments', async () => {
        await expect(
            embedAttachmentContentForMessages([{ attachments: undefined }, {}]),
        ).resolves.toBeUndefined();
    });
});
