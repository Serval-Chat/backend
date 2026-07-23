import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Body,
    Inject,
    NotFoundException,
    ForbiddenException,
    ConflictException,
    InternalServerErrorException,
    HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiCreatedResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { IEmoji } from '@/di/interfaces/IEmojiRepository';
import path from 'path';
import fs from 'fs';
import { generateSnowflakeId } from '@/utils/snowflake';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { emojiUploadLimits, imageFileFilter, storage } from '@/config/multer';
import {
    processAndSaveImage,
    ImagePresets,
    isAnimatedImage,
    getImageMetadata,
} from '@/utils/imageProcessing';
import { UploadEmojiRequestDTO } from './dto/emoji.request.dto';
import { EmojiResponseDTO } from './dto/emoji.response.dto';
import { EmojiValidationPipe } from '@/validation/EmojiValidationPipe';
import { assertHttpNotMuted } from '@/utils/mute';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';
import { assertHttpNotWarned } from '@/utils/warning';

@Controller('api/v1/servers/:serverId/emojis')
@ApiTags('Server Emojis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerEmojiController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'emojis',
    );

    public constructor(
        @Inject(TYPES.EmojiRepository)
        private emojiRepo: IEmojiRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
        @Inject(TYPES.WarningRepository)
        private warningRepo: IWarningRepository,
    ) {
        // Ensure emoji upload directory exists at startup to avoid runtime write failures
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    @Get()
    @ApiOperation({ summary: 'Get all server emojis' })
    @ApiOkResponse({
        type: [EmojiResponseDTO],
        description: 'Server emojis retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.SERVER.NOT_FOUND })
    public async getServerEmojis(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IEmoji[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.emojiRepo.findByServerIdWithCreator(serverId);
    }

    @Post()
    @UseInterceptors(
        FileInterceptor('emoji', {
            storage,
            fileFilter: imageFileFilter,
            limits: emojiUploadLimits,
        }),
    )
    @ApiOperation({ summary: 'Upload a server emoji' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                emoji: { type: 'string', format: 'binary' },
                name: { type: 'string' },
            },
        },
    })
    @ApiCreatedResponse({
        type: EmojiResponseDTO,
        description: 'Emoji uploaded',
    })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.EMOJI.FILE_REQUIRED,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @ApiResponse({ status: 409, description: ErrorMessages.EMOJI.NAME_EXISTS })
    @HttpCode(201)
    public async uploadEmoji(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @UploadedFile(EmojiValidationPipe) emoji: Express.Multer.File,
        @Body() body: UploadEmojiRequestDTO,
    ): Promise<IEmoji> {
        const { name } = body;
        await assertHttpNotMuted(this.muteRepo, userId, 'upload emojis');
        await assertHttpNotWarned(this.warningRepo, userId, 'upload emojis');

        const server = await this.serverRepo.findById(serverId);
        if (server === null || String(server.ownerId) !== userId) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const isOwner = String(server.ownerId) === userId;
        if (
            !isOwner &&
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            );
        }

        const existingEmoji = await this.emojiRepo.findByServerAndName(
            serverId,
            name,
        );
        if (existingEmoji !== null) {
            throw new ConflictException(ErrorMessages.EMOJI.NAME_EXISTS);
        }

        const emojiId = generateSnowflakeId();
        const input = emoji.path || emoji.buffer;

        try {
            const isAnimated = await isAnimatedImage(input);
            const metadata = await getImageMetadata(input);
            const format =
                metadata.format === 'gif' ? 'gif' : isAnimated ? 'webp' : 'png';

            const fileName = `${emojiId}.${format}`;
            const filePath = path.join(this.UPLOADS_DIR, fileName);

            await processAndSaveImage(
                input,
                filePath,
                ImagePresets.emoji(isAnimated, format),
            );

            // Cleanup temporary Multer file if it was written to disk
            if (emoji.path && fs.existsSync(emoji.path)) {
                fs.unlinkSync(emoji.path);
            }

            const imageUrl = `/uploads/emojis/${fileName}`;

            const newEmoji = await this.emojiRepo.create({
                name,
                imageUrl,
                serverId: serverId,
                createdBy: userId,
            });

            const populatedEmoji = await this.emojiRepo.findByIdWithCreator(
                newEmoji.snowflakeId,
            );

            if (populatedEmoji === null) {
                throw new InternalServerErrorException(
                    ErrorMessages.EMOJI.NOT_FOUND,
                );
            }

            this.wsServer.broadcastToServer(serverId, {
                type: 'emoji_updated',
                payload: { serverId, senderId: userId },
            });

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType: 'emoji_create',
                targetId: newEmoji.snowflakeId,
                targetType: 'server',
                metadata: { emojiName: name },
            });

            return populatedEmoji;
        } catch (error) {
            this.logger.error('Error adding emoji:', error);
            if (error instanceof ApiError) throw error;
            throw new InternalServerErrorException(
                ErrorMessages.SYSTEM.INTERNAL_ERROR,
            );
        }
    }

    @Get(':emojiId')
    @ApiOperation({ summary: 'Get a specific emoji' })
    @ApiOkResponse({ type: EmojiResponseDTO, description: 'Emoji retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.EMOJI.NOT_FOUND })
    public async getEmoji(
        @Param('serverId') serverId: string,
        @Param('emojiId') emojiId: string,
        @CurrentUser('id') userId: string,
    ): Promise<IEmoji> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (emoji === null || emoji.serverId !== serverId) {
            throw new NotFoundException(ErrorMessages.EMOJI.NOT_FOUND);
        }

        return emoji;
    }

    @Delete(':emojiId')
    @ApiOperation({ summary: 'Delete a server emoji' })
    @ApiResponse({ status: 204, description: 'Emoji deleted' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.EMOJI.NOT_FOUND })
    @HttpCode(204)
    public async deleteEmoji(
        @Param('serverId') serverId: string,
        @Param('emojiId') emojiId: string,
        @CurrentUser('id') userId: string,
    ): Promise<void> {
        await assertHttpNotMuted(this.muteRepo, userId, 'delete emojis');
        await assertHttpNotWarned(this.warningRepo, userId, 'delete emojis');

        const server = await this.serverRepo.findById(serverId);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (String(server.ownerId) !== userId) {
            throw new ForbiddenException(ErrorMessages.SERVER.ONLY_OWNER);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (emoji === null || emoji.serverId !== serverId) {
            throw new NotFoundException(ErrorMessages.EMOJI.NOT_FOUND);
        }

        // Remove the physical file from disk before deleting the database record
        // Best-effort filesystem cleanup; missing files are ignored
        const filePath = path.join(process.cwd(), emoji.imageUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await this.emojiRepo.delete(emojiId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'emoji_updated',
            payload: { serverId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'emoji_delete',
            targetId: emojiId,
            targetType: 'server',
            metadata: { emojiName: emoji.name },
        });
    }
}
