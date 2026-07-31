/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fsPromises } from 'fs';
import path from 'path';

import { getUploadsDir } from '@/utils/attachments';
import type { ILogger } from '@/di/interfaces/ILogger';

import { FileController } from '../FileController';

const mockLogger: ILogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

describe('FileController', () => {
    const uploadsDir = getUploadsDir();
    const createdFiles: string[] = [];
    let controller: FileController;

    beforeEach(async () => {
        jest.clearAllMocks();
        createdFiles.length = 0;
        await fsPromises.mkdir(uploadsDir, { recursive: true });
        controller = new FileController(
            mockLogger,
            {} as any,
            {} as any,
            {} as any,
        );
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

    describe('getFileMetadata', () => {
        it('still recognizes plain text content as non-binary for an unrecognized extension', async () => {
            const filename = 'notes.unknownext';
            createdFiles.push(filename);
            await fsPromises.writeFile(
                path.join(uploadsDir, filename),
                'just plain text content\n',
            );

            const metadata = await controller.getFileMetadata(filename);

            expect(metadata.isBinary).toBe(false);
            expect(metadata.mimeType).toBe('text/plain');
        });
    });
});
