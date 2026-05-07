import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import { writeFile } from 'fs/promises';

/**
 * Image processing options for sharp pipeline configuration
 */
export interface ImageProcessingOptions {
    /** Target width (undefined to keep original) */
    width?: number;
    /** Target height (undefined to keep original) */
    height?: number;
    /** Resize fit mode */
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    /** Output format */
    format: 'png' | 'jpeg' | 'webp' | 'gif';
    /** Compression quality (1-100, default: 85) */
    quality?: number;
    /** CPU effort for compression (0-6 for webp, 1-10 for png/gif) */
    effort?: number;
    /** Whether the image may be animated */
    animated?: boolean;
    /** Background color for contain fit (default: transparent) */
    background?: { r: number; g: number; b: number; alpha: number };
    /** Whether to strip all metadata (default: true) */
    stripMetadata?: boolean;
}

export const ImagePresets = {
    serverIcon: (_input: string | Buffer): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format: 'png',
        quality: 90,
        stripMetadata: true,
    }),

    serverBanner: (isGif: boolean): ImageProcessingOptions => ({
        width: 960,
        height: 540,
        fit: 'cover',
        format: isGif ? 'gif' : 'png',
        quality: 85,
        animated: isGif,
        stripMetadata: true,
    }),

    emoji: (
        isAnimated: boolean,
        format: 'png' | 'webp' | 'gif',
    ): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'contain',
        format,
        quality: 90,
        animated: isAnimated,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        stripMetadata: true,
    }),

    roleIcon: (): ImageProcessingOptions => ({
        width: 64,
        height: 64,
        fit: 'cover',
        format: 'webp',
        quality: 85,
        stripMetadata: true,
    }),

    webhookAvatar: (): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format: 'png',
        quality: 90,
        stripMetadata: true,
    }),

    profilePicture: (
        format: 'webp' | 'gif' = 'webp',
        animated: boolean = false,
    ): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format,
        quality: 85,
        animated,
        stripMetadata: true,
    }),

    profileBanner: (
        format: 'webp' | 'gif' = 'webp',
        animated: boolean = false,
    ): ImageProcessingOptions => ({
        width: 1136,
        height: 400,
        fit: 'inside',
        format,
        quality: 80,
        animated,
        stripMetadata: true,
    }),
};

/**
 * @param input - Path to image file or Buffer
 * @param options - Processing options
 * @returns Promise resolving to processed image buffer and info
 */
export async function processImage(
    input: string | Buffer,
    options: ImageProcessingOptions,
): Promise<{ buffer: Buffer; info: OutputInfo }> {
    const {
        width,
        height,
        fit = 'cover',
        format,
        quality = 85,
        effort,
        animated = false,
        background,
        stripMetadata = true,
    } = options;

    let pipeline = sharp(input, { animated });

    if (width !== undefined || height !== undefined) {
        const resizeOptions: sharp.ResizeOptions = { fit };
        if (background && fit === 'contain') {
            resizeOptions.background = background;
        }
        pipeline = pipeline.resize(width, height, resizeOptions);
    }

    switch (format) {
        case 'jpeg':
            pipeline = pipeline.jpeg({
                quality,
                progressive: true,
                mozjpeg: true,
            });
            break;
        case 'webp':
            pipeline = pipeline.webp({
                quality,
                effort: effort ?? 6,
                lossless: false,
                smartSubsample: true,
                ...(animated && { loop: 0 }),
            });
            break;
        case 'png':
            pipeline = pipeline.png({
                quality,
                compressionLevel: 9,
                palette: true,
                effort: effort ?? 10,
                progressive: true,
            });
            break;
        case 'gif':
            pipeline = pipeline.gif({
                effort: effort ?? 10,
            });
            break;
    }

    if (stripMetadata === true) {
        pipeline = pipeline.withMetadata({
            exif: {},
        });
    }

    const buffer = await pipeline.toBuffer({ resolveWithObject: true });

    return { buffer: buffer.data, info: buffer.info };
}

/**
 * @param input - Path to image file or Buffer
 * @param outputPath - Destination file path
 * @param options - Processing options
 * @returns Promise resolving to output info
 */
export async function processAndSaveImage(
    input: string | Buffer,
    outputPath: string,
    options: ImageProcessingOptions,
): Promise<OutputInfo> {
    const { buffer, info } = await processImage(input, options);
    await writeFile(outputPath, buffer);
    return info;
}

/**
 * @param input - Path to image file or Buffer
 * @returns Promise resolving to metadata
 */
export async function getImageMetadata(input: string | Buffer) {
    return sharp(input).metadata();
}

/**
 * @param input - Path to image file or Buffer
 * @returns Promise resolving to boolean indicating if animated
 */
export async function isAnimatedImage(
    input: string | Buffer,
): Promise<boolean> {
    const metadata = await sharp(input).metadata();
    return metadata.pages !== undefined && metadata.pages > 1;
}

/**
 * @param input - Path to image file or Buffer
 * @param outputPath - Destination file path (optional, returns buffer if not provided)
 * @returns Promise resolving to buffer or void
 */
export async function stripMetadata(
    input: string | Buffer,
    outputPath?: string,
): Promise<Buffer | void> {
    const pipeline = sharp(input).withMetadata({
        exif: {},
    });

    if (outputPath !== undefined) {
        await pipeline.toFile(outputPath);
    } else {
        return pipeline.toBuffer();
    }
}
