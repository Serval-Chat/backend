import { UPLOAD_DIRS, UPLOAD_SUBDIRS } from '../uploads';

describe('upload directories', () => {
    it.each(['profiles', 'banners', 'emojis', 'stickers'])(
        'creates uploads/%s, which is served statically',
        (name) => {
            expect(UPLOAD_DIRS).toContain(`uploads/${name}`);
        },
    );

    it.each(['uploads', 'servers', 'webhooks', 'sounds'])(
        'still creates uploads/%s',
        (name) => {
            expect(UPLOAD_DIRS).toContain(`uploads/${name}`);
        },
    );

    it('creates the root before its children', () => {
        expect(UPLOAD_DIRS[0]).toBe('uploads');
    });

    it('lists every subdirectory exactly once', () => {
        expect(new Set(UPLOAD_SUBDIRS).size).toBe(UPLOAD_SUBDIRS.length);
        expect(UPLOAD_DIRS).toHaveLength(UPLOAD_SUBDIRS.length + 1);
    });
});
