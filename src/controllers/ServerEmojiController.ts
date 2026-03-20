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
    Req,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    InternalServerErrorException,
    HttpCode,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';

import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { IEmoji } from '@/di/interfaces/IEmojiRepository';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { storage } from '@/config/multer';
import {
    processAndSaveImage,
    ImagePresets,
    isAnimatedImage,
    getImageMetadata,
} from '@/utils/imageProcessing';

// Controller for managing server-specific emojis
// Enforces server membership and 'manageServer' permission checks
@injectable()
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

    constructor(
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
    ) {
        // Ensure emoji upload directory exists at startup to avoid runtime write failures
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    // Retrieves all emojis for a specific server
    // Enforces server membership
    @Get()
    @ApiOperation({ summary: 'Get all server emojis' })
    @ApiResponse({ status: 200, description: 'Server emojis retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.SERVER.NOT_FOUND })
    public async getServerEmojis(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<IEmoji[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.emojiRepo.findByServerIdWithCreator(serverOid);
    }

    // Uploads a new emoji to a server
    // Resizes the image to 128x128 and enforces 'manageServer' permission
    @Post()
    @UseInterceptors(FileInterceptor('emoji', { storage }))
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
    @ApiResponse({ status: 201, description: 'Emoji uploaded' })
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
        @Req() req: ExpressRequest,
        @UploadedFile() emoji: Express.Multer.File,
        @Body('name') name: string,
    ): Promise<IEmoji> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (!emoji) {
            throw new BadRequestException(ErrorMessages.EMOJI.FILE_REQUIRED);
        }

        if (!name || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
            throw new BadRequestException(ErrorMessages.EMOJI.INVALID_NAME);
        }

        const server = await this.serverRepo.findById(serverOid);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const isOwner = server.ownerId.equals(userOid);
        if (
            !isOwner &&
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            );
        }

        const existingEmoji = await this.emojiRepo.findByServerAndName(
            serverOid,
            name,
        );
        if (existingEmoji) {
            throw new ConflictException(ErrorMessages.EMOJI.NAME_EXISTS);
        }

        const emojiId = new mongoose.Types.ObjectId();
        const input = emoji.path || emoji.buffer;
        if (!input) {
            throw new InternalServerErrorException(
                ErrorMessages.FILE.DATA_MISSING,
            );
        }

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
                serverId: serverOid,
                createdBy: userOid,
            });

            const populatedEmoji = await this.emojiRepo.findByIdWithCreator(
                newEmoji._id,
            );

            if (!populatedEmoji) {
                throw new InternalServerErrorException(
                    ErrorMessages.EMOJI.NOT_FOUND,
                );
            }

            this.wsServer.broadcastToServer(serverId, {
                type: 'emoji_updated',
                payload: { serverId, senderId: userId },
            });

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'emoji_create',
                targetId: newEmoji._id as Types.ObjectId,
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

    // Retrieves a specific emoji by ID
    // Enforces server membership
    @Get(':emojiId')
    @ApiOperation({ summary: 'Get a specific emoji' })
    @ApiResponse({ status: 200, description: 'Emoji retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.EMOJI.NOT_FOUND })
    public async getEmoji(
        @Param('serverId') serverId: string,
        @Param('emojiId') emojiId: string,
        @Req() req: ExpressRequest,
    ): Promise<IEmoji> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const emojiOid = new Types.ObjectId(emojiId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const emoji = await this.emojiRepo.findById(emojiOid);
        if (!emoji || !emoji.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.EMOJI.NOT_FOUND);
        }

        return emoji;
    }

    // Deletes an emoji from a server
    // Enforces 'manageServer' permission
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
        @Req() req: ExpressRequest,
    ): Promise<void> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const emojiOid = new Types.ObjectId(emojiId);

        const server = await this.serverRepo.findById(serverOid);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (!server.ownerId.equals(userOid)) {
            throw new ForbiddenException(ErrorMessages.SERVER.ONLY_OWNER);
        }

        const emoji = await this.emojiRepo.findById(emojiOid);
        if (!emoji || !emoji.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.EMOJI.NOT_FOUND);
        }

        // Remove the physical file from disk before deleting the database record
        // Best-effort filesystem cleanup; missing files are ignored
        const filePath = path.join(process.cwd(), emoji.imageUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await this.emojiRepo.delete(emojiOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'emoji_updated',
            payload: { serverId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'emoji_delete',
            targetId: emojiOid,
            targetType: 'server',
            metadata: { emojiName: emoji.name },
        });
    }
}
