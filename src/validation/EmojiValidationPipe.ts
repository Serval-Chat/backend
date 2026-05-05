import {
    Injectable,
    PipeTransform,
    BadRequestException,
} from '@nestjs/common';
import { ErrorMessages } from '@/constants/errorMessages';
import { Express } from 'express';

@Injectable()
export class EmojiValidationPipe implements PipeTransform<Express.Multer.File | undefined, Promise<Express.Multer.File>> {
    public async transform(value: Express.Multer.File | undefined): Promise<Express.Multer.File> {
        if (value === undefined) {
            throw new BadRequestException(ErrorMessages.EMOJI.FILE_REQUIRED);
        }

        if (value.size > 10 * 1024 * 1024) {
            throw new BadRequestException(ErrorMessages.EMOJI.FILE_REQUIRED); 
        }

        if (!value.mimetype.startsWith('image/')) {
            throw new BadRequestException('File must be an image');
        }

        return value;
    }
}
