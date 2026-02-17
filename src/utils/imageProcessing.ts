import sharp from 'sharp';
import type { OutputInfo } from 'sharp';

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
    /** Whether the image may be animated */
    animated?: boolean;
    /** Background color for contain fit (default: transparent) */
    background?: { r: number; g: number; b: number; alpha: number };
    /** Whether to strip all metadata (default: true) */
    stripMetadata?: boolean;
}

/**
 * Default processing options for common use cases
 */
export const ImagePresets = {
    /** Server icon: 256x256 PNG */
    serverIcon: (_input: string | Buffer): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format: 'png',
        quality: 90,
        stripMetadata: true,
    }),

    /** Server banner: 960x540 PNG/GIF */
    serverBanner: (isGif: boolean): ImageProcessingOptions => ({
        width: 960,
        height: 540,
        fit: 'cover',
        format: isGif ? 'gif' : 'png',
        quality: 85,
        animated: isGif,
        stripMetadata: true,
    }),

    /** Emoji: 128x128 PNG/WebP/GIF */
    emoji: (isAnimated: boolean, format: 'png' | 'webp' | 'gif'): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'contain',
        format,
        quality: 90,
        animated: isAnimated,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        stripMetadata: true,
    }),

    /** Role icon: 64x64 WebP */
    roleIcon: (): ImageProcessingOptions => ({
        width: 64,
        height: 64,
        fit: 'cover',
        format: 'webp',
        quality: 85,
        stripMetadata: true,
    }),

    /** Webhook avatar: 128x128 PNG */
    webhookAvatar: (): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format: 'png',
        quality: 90,
        stripMetadata: true,
    }),

    /** Profile picture: 128x128 WebP */
    profilePicture: (): ImageProcessingOptions => ({
        width: 256,
        height: 256,
        fit: 'cover',
        format: 'webp',
        quality: 85,
        stripMetadata: true,
    }),

    /** Profile banner: up to 1136x400 WebP */
    profileBanner: (): ImageProcessingOptions => ({
        width: 1136,
        height: 400,
        fit: 'inside',
        format: 'webp',
        quality: 80,
        stripMetadata: true,
    }),
};

/**
 * Process an image with the specified options.
 * Strips all metadata (EXIF, GPS, etc.) and applies compression.
 *
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
        animated = false,
        background,
        stripMetadata = true,
    } = options;

    let pipeline = sharp(input, { animated });

    // Apply resize if dimensions specified
    if (width || height) {
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
                effort: 6, // Higher effort = better compression
                ...(animated && { loop: 0 }),
            });
            break;
        case 'png':
            pipeline = pipeline.png({
                quality,
                compressionLevel: 9, // Maximum compression
                progressive: true,
            });
            break;
        case 'gif':
            pipeline = pipeline.gif({
                effort: 10, // Maximum compression effort
            });
            break;
    }

    if (stripMetadata) {
        pipeline = pipeline.withMetadata({
            exif: {},
        });
    }

    const buffer = await pipeline.toBuffer({ resolveWithObject: true });

    return { buffer: buffer.data, info: buffer.info };
}

/**
 * Process an image and save directly to file.
 * Strips all metadata and applies compression.
 *
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
    await sharp(buffer).toFile(outputPath);
    return info;
}

/**
 * Get image metadata without processing.
 * Useful for validation before processing.
 *
 * @param input - Path to image file or Buffer
 * @returns Promise resolving to metadata
 */
export async function getImageMetadata(input: string | Buffer) {
    return sharp(input).metadata();
}

/**
 * Check if an image is animated (has multiple pages/frames).
 *
 * @param input - Path to image file or Buffer
 * @returns Promise resolving to boolean indicating if animated
 */
export async function isAnimatedImage(input: string | Buffer): Promise<boolean> {
    const metadata = await sharp(input).metadata();
    return !!(metadata.pages && metadata.pages > 1);
}

/**
 * Strip metadata from an image without resizing or re-encoding.
 * This is useful when you want to keep original dimensions/format
 * but remove all identifying information.
 *
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

    if (outputPath) {
        await pipeline.toFile(outputPath);
    } else {
        return pipeline.toBuffer();
    }
}
