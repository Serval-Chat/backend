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
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { IEmoji } from '@/di/interfaces/IEmojiRepository';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { storage } from '@/config/multer';

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
        @inject(TYPES.EmojiRepository)
        @Inject(TYPES.EmojiRepository)
        private emojiRepo: IEmojiRepository,
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
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
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.emojiRepo.findByServerIdWithCreator(serverId);
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

        if (!emoji) {
            throw new BadRequestException(ErrorMessages.EMOJI.FILE_REQUIRED);
        }

        if (!name || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
            throw new BadRequestException(ErrorMessages.EMOJI.INVALID_NAME);
        }

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const isOwner = server.ownerId.toString() === userId;
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

        const metadata = await sharp(input).metadata();
        const isAnimated = metadata.pages && metadata.pages > 1;

        let ext = '.png';
        let pipeline = sharp(input, { animated: true });

        // Determine format based on animation; preserve GIFs or fallback to WebP/PNG
        if (isAnimated) {
            if (metadata.format === 'gif') {
                ext = '.gif';
                pipeline = pipeline.gif();
            } else {
                ext = '.webp';
                pipeline = pipeline.webp();
            }
        } else {
            ext = '.png';
            pipeline = pipeline.png();
        }

        const fileName = `${emojiId}${ext}`;
        const filePath = path.join(this.UPLOADS_DIR, fileName);

        await pipeline
            .resize(128, 128, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .toFile(filePath);

        // Cleanup temporary Multer file if it was written to disk
        if (emoji.path && fs.existsSync(emoji.path)) {
            fs.unlinkSync(emoji.path);
        }

        const imageUrl = `/uploads/emojis/${fileName}`;

        const newEmoji = await this.emojiRepo.create({
            name,
            imageUrl,
            serverId,
            createdBy: userId,
        });

        const populatedEmoji = await this.emojiRepo.findByIdWithCreator(
            newEmoji._id.toString(),
        );

        if (!populatedEmoji) {
            throw new InternalServerErrorException(
                ErrorMessages.EMOJI.NOT_FOUND,
            );
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('emoji_updated', { serverId });

        return populatedEmoji;
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
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji || emoji.serverId.toString() !== serverId) {
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
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.ownerId.toString() !== userId) {
            throw new ForbiddenException(ErrorMessages.SERVER.ONLY_OWNER);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji || emoji.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.EMOJI.NOT_FOUND);
        }

        // Remove the physical file from disk before deleting the database record
        // Best-effort filesystem cleanup; missing files are ignored
        const filePath = path.join(process.cwd(), emoji.imageUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await this.emojiRepo.delete(emojiId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('emoji_updated', { serverId });
    }
}
