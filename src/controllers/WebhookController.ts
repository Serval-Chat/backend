import {
    Controller,
    Get,
    Post,
    Delete,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
    UploadedFile,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IWebhookRepository,
    IWebhook,
} from '@/di/interfaces/IWebhookRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { generateWebhookToken } from '@/services/WebhookService';
import { getIO } from '@/socket';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import express from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface CreateWebhookRequest {
    name: string;
    avatarUrl?: string;
}

interface ExecuteWebhookRequest {
    content: string;
    username?: string;
    avatarUrl?: string;
}

// Controller for managing and executing webhooks
@injectable()
@Route('api/v1')
@Tags('Webhooks')
export class WebhookController extends Controller {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'webhooks',
    );

    constructor(
        @inject(TYPES.WebhookRepository)
        private webhookRepo: IWebhookRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
        // Ensure the uploads directory exists for webhook avatars
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    // List all webhooks for a channel
    @Get('servers/{serverId}/channels/{channelId}/webhooks')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.WEBHOOK.FORBIDDEN,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async getWebhooks(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
    ): Promise<any[]> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const channel = await this.channelRepo.findByIdAndServer(
            channelId,
            serverId,
        );
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const webhooks = await this.webhookRepo.findByChannelId(channelId);
        return webhooks.map((w) => ({
            _id: w._id,
            name: w.name,
            token: w.token,
            avatarUrl: w.avatarUrl,
            createdBy: w.createdBy,
            createdAt: w.createdAt,
        }));
    }

    // Create a new webhook for a channel
    @Post('servers/{serverId}/channels/{channelId}/webhooks')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.WEBHOOK.FORBIDDEN,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async createWebhook(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
        @Body() body: CreateWebhookRequest,
    ): Promise<IWebhook> {
        // @ts-ignore
        const userId = req.user.id;
        // @ts-ignore
        const username = req.user.username;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const channel = await this.channelRepo.findByIdAndServer(
            channelId,
            serverId,
        );
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        let token: string;
        let attempts = 0;
        do {
            token = generateWebhookToken();
            attempts++;
            if (attempts > 10) {
                this.setStatus(500);
                throw new Error(ErrorMessages.WEBHOOK.TOKEN_GENERATION_FAILED);
            }
        } while (await this.webhookRepo.findByToken(token));

        const webhook = await this.webhookRepo.create({
            serverId,
            channelId,
            name: body.name.trim(),
            token,
            avatarUrl: body.avatarUrl?.trim() || undefined,
            createdBy: username,
        });

        this.setStatus(201);
        return webhook;
    }

    // Delete a webhook
    @Delete('servers/{serverId}/channels/{channelId}/webhooks/{webhookId}')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.WEBHOOK.FORBIDDEN,
    })
    @Response<ErrorResponse>('404', 'Webhook Not Found', {
        error: ErrorMessages.WEBHOOK.NOT_FOUND,
    })
    public async deleteWebhook(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() webhookId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const webhook = await this.webhookRepo.findById(webhookId);
        if (
            !webhook ||
            webhook.serverId.toString() !== serverId ||
            webhook.channelId.toString() !== channelId
        ) {
            this.setStatus(404);
            throw new Error(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        await this.webhookRepo.delete(webhookId);

        return { message: 'Webhook deleted successfully' };
    }

    // Upload webhook avatar
    @Post('servers/{serverId}/channels/{channelId}/webhooks/{webhookId}/avatar')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.WEBHOOK.FORBIDDEN,
    })
    @Response<ErrorResponse>('404', 'Webhook Not Found', {
        error: ErrorMessages.WEBHOOK.NOT_FOUND,
    })
    public async uploadWebhookAvatar(
        @Path() serverId: string,
        @Path() channelId: string,
        @Path() webhookId: string,
        @Request() req: express.Request,
        @UploadedFile() avatar: Express.Multer.File,
    ): Promise<{ avatarUrl: string }> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const webhook = await this.webhookRepo.findById(webhookId);
        if (
            !webhook ||
            webhook.serverId.toString() !== serverId ||
            webhook.channelId.toString() !== channelId
        ) {
            this.setStatus(404);
            throw new Error(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        if (!avatar) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const filename = `${webhookId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = avatar.path || avatar.buffer;
        if (!input) {
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.DATA_MISSING);
        }

        // Process image to ensure consistent size and format to PNG
        await sharp(input)
            .resize(128, 128, { fit: 'cover' })
            .png()
            .toFile(filepath);

        // Cleanup temporary Multer file from disk
        if (avatar.path && fs.existsSync(avatar.path)) {
            fs.unlinkSync(avatar.path);
        }

        const avatarUrl = `/api/v1/webhooks/avatar/${filename}`;
        await this.webhookRepo.update(webhookId, { avatarUrl });

        return { avatarUrl };
    }

    // Get webhook avatar
    //
    // Serves avatar images
    @Get('webhooks/avatar/{filename}')
    @Response<ErrorResponse>('404', 'Avatar Not Found', {
        error: ErrorMessages.WEBHOOK.AVATAR_NOT_FOUND,
    })
    public async getWebhookAvatar(@Path() filename: string): Promise<any> {
        // Validate filename to prevent directory traversal attacks
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FILE.INVALID_FILENAME);
        }

        const filepath = path.join(this.UPLOADS_DIR, filename);

        if (!fs.existsSync(filepath)) {
            this.setStatus(404);
            throw new Error(ErrorMessages.WEBHOOK.AVATAR_NOT_FOUND);
        }

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            this.setHeader('Content-Type', 'image/gif');
        } else {
            this.setHeader('Content-Type', 'image/png');
        }

        return fs.createReadStream(filepath);
    }

    // Execute a webhook (public endpoint)
    //
    // Uses a 128-character token for authentication instead of JWT (only because those tokens don't expire unless explicitly deleted)
    @Post('webhooks/{token}')
    @Response<ErrorResponse>('401', 'Invalid Token', {
        error: ErrorMessages.WEBHOOK.INVALID_TOKEN,
    })
    @Response<ErrorResponse>('404', 'Webhook Not Found', {
        error: ErrorMessages.WEBHOOK.NOT_FOUND,
    })
    public async executeWebhook(
        @Path() token: string,
        @Body() body: ExecuteWebhookRequest,
    ): Promise<{ id: string; timestamp: Date }> {
        if (!token || token.length !== 128 || !/^[a-f0-9]{128}$/i.test(token)) {
            this.setStatus(401);
            throw new Error(ErrorMessages.WEBHOOK.INVALID_TOKEN);
        }

        const webhook = await this.webhookRepo.findByToken(token);
        if (!webhook) {
            this.setStatus(404);
            throw new Error(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        const { content, username, avatarUrl } = body;
        if (!content || content.trim().length === 0) {
            this.setStatus(400);
            throw new Error(ErrorMessages.MESSAGE.CONTENT_REQUIRED);
        }

        const webhookUsername = username
            ? username.trim().substring(0, 100)
            : webhook.name;
        const webhookAvatarUrl = avatarUrl
            ? avatarUrl.trim()
            : webhook.avatarUrl;

        // Use a dedicated system user ID for all webhook messages
        const webhookSystemUserId = new mongoose.Types.ObjectId(
            '000000000000000000000000',
        );

        const message = await this.serverMessageRepo.create({
            serverId: new mongoose.Types.ObjectId(webhook.serverId.toString()),
            channelId: new mongoose.Types.ObjectId(
                webhook.channelId.toString(),
            ),
            senderId: webhookSystemUserId,
            text: content.trim(),
            isWebhook: true,
            webhookUsername,
            webhookAvatarUrl: webhookAvatarUrl || undefined,
        });

        await this.channelRepo.updateLastMessageAt(
            webhook.channelId.toString(),
        );
        messagesSentCounter.labels('webhook').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const io = getIO();
        const msg = (message as any).toObject
            ? (message as any).toObject()
            : message;
        msg._id = msg._id.toString();
        msg.serverId = webhook.serverId.toString();
        msg.channelId = webhook.channelId.toString();

        io.to(`channel:${webhook.channelId.toString()}`).emit(
            'server_message',
            msg,
        );

        io.to(`server:${webhook.serverId.toString()}`).emit('channel_unread', {
            serverId: webhook.serverId.toString(),
            channelId: webhook.channelId.toString(),
            lastMessageAt: message.createdAt,
            senderId: webhookSystemUserId.toHexString(),
        });

        this.setStatus(201);
        return {
            id: message._id.toString(),
            timestamp: message.createdAt,
        };
    }
}
