import { promises as fsPromises } from 'fs';
import path from 'path';

import {
    buildAttachmentMetadata,
    containsSvgMarkup,
    getUploadsDir,
} from '@/utils/attachments';

const HOSTILE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)">' +
    '<script>alert(1)</script></svg>';

describe('containsSvgMarkup', () => {
    it('recognises svg however it is introduced', () => {
        expect(containsSvgMarkup(Buffer.from('<svg viewBox="0 0 1 1"/>'))).toBe(
            true,
        );
        expect(containsSvgMarkup(Buffer.from('  \n\t<svg>'))).toBe(true);
        expect(
            containsSvgMarkup(
                Buffer.from('<?xml version="1.0"?>\n<!-- c -->\n<svg>'),
            ),
        ).toBe(true);
        expect(containsSvgMarkup(Buffer.from('﻿<svg>'))).toBe(true);
        expect(containsSvgMarkup(Buffer.from('<SVG >'))).toBe(true);
    });

    it('does not fire on text that merely mentions svg', () => {
        expect(
            containsSvgMarkup(Buffer.from('an svg is a vector format')),
        ).toBe(false);
        expect(containsSvgMarkup(Buffer.from('<svgesque>'))).toBe(false);
        expect(containsSvgMarkup(Buffer.from('image/svg+xml'))).toBe(false);
    });

    it('does not fire on binary content', () => {
        expect(containsSvgMarkup(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
            false,
        );
    });
});

describe('svg sanitisation is chosen by content, not by filename', () => {
    const uploadsDir = getUploadsDir();
    const created: string[] = [];

    beforeAll(async () => {
        await fsPromises.mkdir(uploadsDir, { recursive: true });
    });

    afterEach(async () => {
        await Promise.all(
            created.map((f) =>
                fsPromises.rm(path.join(uploadsDir, f), { force: true }),
            ),
        );
        created.length = 0;
    });

    async function upload(filename: string, body: string) {
        created.push(filename);
        await fsPromises.writeFile(path.join(uploadsDir, filename), body);
        const attachment = await buildAttachmentMetadata(filename);
        const onDisk = await fsPromises.readFile(
            path.join(uploadsDir, filename),
            'utf8',
        );
        return { attachment, onDisk };
    }

    it('sanitises svg smuggled behind a .png name', async () => {
        const { attachment, onDisk } = await upload(
            '0123456789abcdef0123-payload.png',
            HOSTILE_SVG,
        );

        expect(onDisk).not.toContain('onload');
        expect(onDisk).not.toContain('<script');
        expect(attachment.mimeType).toBe('image/svg+xml');
    });

    it.each(['payload.txt', 'payload.jpeg', 'payload', 'payload.svg.txt'])(
        'sanitises svg smuggled behind %s',
        async (name) => {
            const { onDisk } = await upload(
                `0123456789abcdef0123-${name}`,
                HOSTILE_SVG,
            );

            expect(onDisk).not.toContain('onload');
            expect(onDisk).not.toContain('<script');
        },
    );

    it('still sanitises a genuine .svg', async () => {
        const { attachment, onDisk } = await upload(
            '0123456789abcdef0123-real.svg',
            HOSTILE_SVG,
        );

        expect(onDisk).not.toContain('onload');
        expect(attachment.mimeType).toBe('image/svg+xml');
    });

    it('reports the corrected type, so the mislabelled name cannot misrepresent it', async () => {
        const { attachment } = await upload(
            '0123456789abcdef0123-payload.png',
            HOSTILE_SVG,
        );

        expect(attachment.mimeType).not.toBe('image/png');
        expect(attachment.type).toBe('image');
    });

    it('leaves a file that is not svg untouched', async () => {
        const body = 'plain text, mentions <svgetc but is not markup';
        const { attachment, onDisk } = await upload(
            '0123456789abcdef0123-notes.txt',
            body,
        );

        expect(onDisk).toBe(body);
        expect(attachment.mimeType).toBe('text/plain');
    });
});
