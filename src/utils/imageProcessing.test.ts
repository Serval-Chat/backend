import sharp from 'sharp';

import { ImagePresets, processImage, stripMetadata } from './imageProcessing';

const JPEG_WITH_GPS_EXIF = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAAAAAAD/4QDURXhpZgAATU0AKgAAAAgABQEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAEAAAITAAMAAAABAAEAAIglAAQAAAABAAAAWgAAAAAAAAAAAAAAAQAAAAAAAAABAAUAAAABAAAABAIDAAAAAQACAAAAAk4AAAAAAgAFAAAAAwAAAJwAAwACAAAAAlcAAAAABAAFAAAAAwAAALQAAAAAAAAAKAAAAAEAAAAaAAAAAQAAAo4AAAAZAAAATwAAAAEAAAA7AAAAAQAABGsAAAAZ/9sAQwADAgICAgIDAgICAwMDAwQGBAQEBAQIBgYFBgkICgoJCAkJCgwPDAoLDgsJCQ0RDQ4PEBAREAoMEhMSEBMPEBAQ/9sAQwEDAwMEAwQIBAQIEAsJCxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ/8AAEQgACAAIAwERAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA6AxVN/9k=',
    'base64',
);

describe('processImage', () => {
    it('strips EXIF/GPS metadata by default (stripMetadata: true)', async () => {
        const { buffer } = await processImage(JPEG_WITH_GPS_EXIF, {
            format: 'jpeg',
            stripMetadata: true,
        });

        const metadata = await sharp(buffer).metadata();
        expect(metadata.exif).toBeUndefined();
    });

    it('preserves EXIF/GPS metadata when stripMetadata is explicitly false', async () => {
        const { buffer } = await processImage(JPEG_WITH_GPS_EXIF, {
            format: 'jpeg',
            stripMetadata: false,
        });

        const metadata = await sharp(buffer).metadata();
        expect(metadata.exif).toBeDefined();
    });

    it('strips metadata for every ImagePreset (all default to stripMetadata: true)', async () => {
        const presets: ReturnType<
            (typeof ImagePresets)[keyof typeof ImagePresets]
        >[] = [
            ImagePresets.serverIcon(),
            ImagePresets.serverBanner(false),
            ImagePresets.emoji(false, 'png'),
            ImagePresets.roleIcon(),
            ImagePresets.webhookAvatar(),
            ImagePresets.profilePicture(),
            ImagePresets.profileBanner(),
        ];

        for (const preset of presets) {
            const { buffer } = await processImage(JPEG_WITH_GPS_EXIF, preset);
            const metadata = await sharp(buffer).metadata();
            expect(metadata.exif).toBeUndefined();
        }
    });
});

describe('stripMetadata', () => {
    it('strips EXIF/GPS metadata from a buffer', async () => {
        const result = await stripMetadata(JPEG_WITH_GPS_EXIF);
        const metadata = await sharp(result as Buffer).metadata();
        expect(metadata.exif).toBeUndefined();
    });
});
