import { execFile } from 'child_process';
import { promises as fsPromises } from 'fs';
import path from 'path';

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

import {
    buildAttachmentMetadata,
    buildAttachmentMetadataFromUrl,
    extractLegacyFileMarkers,
    getUploadsDir,
} from './attachments';

const mockedExecFile = execFile as unknown as jest.Mock;

describe('attachment metadata helpers', () => {
    const uploadsDir = getUploadsDir();

    beforeEach(async () => {
        mockedExecFile.mockClear();
        await fsPromises.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await fsPromises.rm(uploadsDir, { recursive: true, force: true });
    });

    it('builds image metadata with dimensions', async () => {
        const filename = '0123456789abcdef0123-pixel.png';
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
        );
        await fsPromises.writeFile(path.join(uploadsDir, filename), png);

        await expect(buildAttachmentMetadata(filename)).resolves.toMatchObject({
            attachmentId: filename,
            type: 'image',
            mimeType: 'image/png',
            name: 'pixel.png',
            size: png.length,
            width: 1,
            height: 1,
        });
    });

    it('builds video metadata with ffprobe dimensions', async () => {
        const filename = 'clip.mp4';
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
        mockedExecFile.mockImplementationOnce(
            (
                _binary: string,
                _args: string[],
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(null, JSON.stringify({ streams: [{}] }), '');
            },
        );
        const filename = 'bad.mp4';
        await fsPromises.writeFile(path.join(uploadsDir, filename), 'not-real');

        await expect(buildAttachmentMetadata(filename)).rejects.toThrow(
            'Could not read video dimensions',
        );
    });

    it('parses legacy file markers and preserves spoiler metadata', async () => {
        const filename = 'note.txt';
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
