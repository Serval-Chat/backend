import {
    Controller,
    Get,
    Post,
    Delete,
    Route,
    Path,
    Security,
    Response,
    Tags,
    Request,
    UploadedFile,
    FormField,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import express from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

/**
 * Controller for managing server-specific emojis.
 * Enforces server membership and 'manageServer' permission checks.
 */
@injectable()
@Route('api/v1/servers/{serverId}/emojis')
@Tags('Server Emojis')
@Security('jwt')
export class ServerEmojiController extends Controller {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'emojis',
    );

    constructor(
        @inject(TYPES.EmojiRepository) private emojiRepo: IEmojiRepository,
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
        // Ensure emoji upload directory exists at startup to avoid runtime write failures
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    /**
     * Retrieves all emojis for a specific server.
     * Enforces server membership.
     */
    @Get()
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Server Not Found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    public async getServerEmojis(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<any[]> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.emojiRepo.findByServerIdWithCreator(serverId);
    }

    /**
     * Uploads a new emoji to a server.
     * Resizes the image to 128x128 and enforces 'manageServer' permission.
     */
    @Post()
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.EMOJI.FILE_REQUIRED,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('409', 'Conflict', {
        error: ErrorMessages.EMOJI.NAME_EXISTS,
    })
    public async uploadEmoji(
        @Path() serverId: string,
        @Request() req: express.Request,
        @UploadedFile() emoji: Express.Multer.File,
        @FormField() name: string,
    ): Promise<any> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;

        if (!emoji) {
            this.setStatus(400);
            throw new Error(ErrorMessages.EMOJI.FILE_REQUIRED);
        }

        if (!name || name.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(name)) {
            this.setStatus(400);
            throw new Error(ErrorMessages.EMOJI.INVALID_NAME);
        }

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
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
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS);
        }

        const existingEmoji = await this.emojiRepo.findByServerAndName(
            serverId,
            name,
        );
        if (existingEmoji) {
            this.setStatus(409);
            throw new Error(ErrorMessages.EMOJI.NAME_EXISTS);
        }

        const emojiId = new mongoose.Types.ObjectId();
        const input = emoji.path || emoji.buffer;
        if (!input) {
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.DATA_MISSING);
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

        const io = getIO();
        io.to(`server:${serverId}`).emit('emoji_updated', { serverId });

        this.setStatus(201);
        return populatedEmoji;
    }

    /**
     * Retrieves a specific emoji by ID.
     * Enforces server membership.
     */
    @Get('{emojiId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Emoji Not Found', {
        error: ErrorMessages.EMOJI.NOT_FOUND,
    })
    public async getEmoji(
        @Path() serverId: string,
        @Path() emojiId: string,
        @Request() req: express.Request,
    ): Promise<any> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji || emoji.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.EMOJI.NOT_FOUND);
        }

        return emoji;
    }

    /**
     * Deletes an emoji from a server.
     * Enforces 'manageServer' permission.
     */
    @Delete('{emojiId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'Emoji Not Found', {
        error: ErrorMessages.EMOJI.NOT_FOUND,
    })
    public async deleteEmoji(
        @Path() serverId: string,
        @Path() emojiId: string,
        @Request() req: express.Request,
    ): Promise<void> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
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
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS);
        }

        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji || emoji.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.EMOJI.NOT_FOUND);
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

        this.setStatus(204);
    }
}
