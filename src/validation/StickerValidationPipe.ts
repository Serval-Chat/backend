import {
    Injectable,
    PipeTransform,
    BadRequestException,
} from '@nestjs/common';
import { ErrorMessages } from '@/constants/errorMessages';
import {
    STICKER_MAX_WIDTH,
    STICKER_MAX_HEIGHT,
    STICKER_MIN_WIDTH,
    STICKER_MIN_HEIGHT,
    STICKER_MAX_SIZE_BYTES,
    SUPPORTED_STICKER_MIMETYPES,
} from '@/constants/stickers';
import { getImageMetadata } from '@/utils/imageProcessing';
import { Express } from 'express';

@Injectable()
export class StickerValidationPipe implements PipeTransform<Express.Multer.File | undefined, Promise<Express.Multer.File>> {
    public async transform(value: Express.Multer.File | undefined): Promise<Express.Multer.File> {
        if (value === undefined) {
            throw new BadRequestException(ErrorMessages.STICKER.FILE_REQUIRED);
        }

        if (value.size > STICKER_MAX_SIZE_BYTES) {
            throw new BadRequestException(ErrorMessages.STICKER.SIZE_TOO_LARGE);
        }

        if (!SUPPORTED_STICKER_MIMETYPES.includes(value.mimetype)) {
            throw new BadRequestException(`File must be one of: ${SUPPORTED_STICKER_MIMETYPES.join(', ')}`);
        }

        const input = value.path || value.buffer;
        try {
            const metadata = await getImageMetadata(input);


            const width = metadata.width || 0;
            const height = metadata.height || 0;

            if (
                width > STICKER_MAX_WIDTH ||
                height > STICKER_MAX_HEIGHT ||
                width < STICKER_MIN_WIDTH ||
                height < STICKER_MIN_HEIGHT
            ) {
                throw new BadRequestException(ErrorMessages.STICKER.INVALID_DIMENSIONS);
            }
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException('Invalid image file');
        }

        return value;
    }
}
