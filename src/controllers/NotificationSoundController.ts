import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Req,
    Res,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Inject,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Request, Response } from 'express';
import path from 'path';
import { promises as fsPromises, constants as fsConstants } from 'fs';
import { randomUUID } from 'crypto';
import { SERVER_URL } from '@/config/env';
import { processAudio } from '@/utils/audio';
import { Types } from 'mongoose';
import { WsServer } from '@/ws/server';
import { JWTPayload } from '@/utils/jwt';
import { injectable } from 'inversify';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';

@ApiTags('Notification Sounds')
@injectable()
@Controller('api/v1/notification-sounds')
@ApiBearerAuth()
export class NotificationSoundController {
    private readonly soundsDir = path.join(process.cwd(), 'uploads', 'sounds');

    public constructor(
        @Inject(TYPES.Logger) private logger: ILogger,
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.WsServer) private wsServer: WsServer,
    ) {
        void this.ensureSoundsDir();
    }

    private async ensureSoundsDir() {
        try {
            await fsPromises.mkdir(this.soundsDir, { recursive: true });
        } catch (err) {
            this.logger.error('Failed to create sounds directory:', err);
        }
    }

    @Post('upload')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 512 * 1024 },
        }),
    )
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload a custom notification sound' })
    public async uploadSound(
        @Req() req: Request,
        @UploadedFile() file: Express.Multer.File | undefined,
    ) {
        if (file === undefined) {
            throw new BadRequestException('No file uploaded');
        }

        const userId = (req as Request & { user: JWTPayload }).user.id;
        const user = await this.userRepo.findById(new Types.ObjectId(userId));
        if (user === null) throw new NotFoundException('User not found');

        const currentSounds = user.settings?.notificationSounds ?? [];
        if (currentSounds.length >= 10) {
            throw new BadRequestException('Max 10 notification sounds allowed');
        }

        const soundId = randomUUID();
        const tempInputPath = path.join(this.soundsDir, `${soundId}_temp`);
        const outputPath = path.join(this.soundsDir, `${soundId}.ogg`);

        try {
            await fsPromises.writeFile(tempInputPath, file.buffer);

            await processAudio(tempInputPath, outputPath, {
                maxDuration: 8,
                sampleRate: 48000,
                channels: 2,
                bitrate: '320k',
            });

            const soundUrl = `${SERVER_URL}/api/v1/notification-sounds/play/${soundId}.ogg`;
            const newSound = {
                id: soundId,
                name: file.originalname.replace(/\.[^/.]+$/, ''),
                url: soundUrl,
                enabled: true,
            };

            const updatedSounds = [...currentSounds, newSound];
            await this.userRepo.updateSettings(user._id, {
                notificationSounds: updatedSounds,
            });

            this.wsServer.broadcastToUser(userId, {
                type: 'notification_sounds_updated',
                payload: { sounds: updatedSounds },
            });

            return newSound;
        } catch (error) {
            this.logger.error('Failed to upload notification sound:', error);
            throw new BadRequestException('Failed to process audio file');
        } finally {
            await fsPromises.unlink(tempInputPath).catch(() => {});
        }
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all custom notification sounds' })
    public async getSounds(@Req() req: Request) {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const user = await this.userRepo.findById(new Types.ObjectId(userId));
        return user?.settings?.notificationSounds ?? [];
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Delete a custom notification sound' })
    public async deleteSound(@Req() req: Request, @Param('id') id: string) {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const user = await this.userRepo.findById(new Types.ObjectId(userId));
        if (user === null) throw new NotFoundException('User not found');

        const currentSounds = user.settings?.notificationSounds ?? [];
        const soundToDelete = currentSounds.find((s) => s.id === id);
        if (soundToDelete === undefined)
            throw new NotFoundException('Sound not found');

        const updatedSounds = currentSounds.filter((s) => s.id !== id);
        await this.userRepo.updateSettings(user._id, {
            notificationSounds: updatedSounds,
        });

        const filePath = path.join(this.soundsDir, `${id}.ogg`);
        await fsPromises.unlink(filePath).catch(() => {});

        this.wsServer.broadcastToUser(userId, {
            type: 'notification_sounds_updated',
            payload: { sounds: updatedSounds },
        });

        return { message: 'Sound deleted' };
    }

    @Get('play/:filename')
    @ApiOperation({ summary: 'Serve a notification sound file' })
    public async playSound(
        @Param('filename') filename: string,
        @Res() res: Response,
    ) {
        const safeFilename = path.basename(filename);
        if (!safeFilename.endsWith('.ogg')) {
            throw new BadRequestException('Invalid sound format');
        }

        const filePath = path.join(this.soundsDir, safeFilename);
        try {
            await fsPromises.access(filePath, fsConstants.F_OK);
            res.setHeader('Content-Type', 'audio/ogg');
            res.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
            );
            res.sendFile(filePath);
        } catch {
            throw new NotFoundException('Sound file not found');
        }
    }
}
