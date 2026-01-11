import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Inject,
    UseInterceptors,
    UploadedFile,
    Res,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
    InternalServerErrorException,
    StreamableFile,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
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
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type {
    IMessageServerEvent,
    IChannelUnreadUpdatedEvent,
} from '@/ws/protocol/events/messages';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import type { Request as ExpressRequest, Response } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { JWTPayload } from '@/utils/jwt';
import {
    CreateWebhookRequestDTO,
    ExecuteWebhookRequestDTO,
    WebhookTokenParamDTO,
    FilenameParamDTO,
} from './dto/webhook.request.dto';
import { storage } from '@/config/multer';

// Controller for managing and executing webhooks
@injectable()
@Controller('api/v1')
@ApiTags('Webhooks')
export class WebhookController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'webhooks',
    );

    constructor(
        @inject(TYPES.WebhookRepository)
        @Inject(TYPES.WebhookRepository)
        private webhookRepo: IWebhookRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
    ) {
        // Ensure the uploads directory exists for webhook avatars
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    // List all webhooks for a channel
    @Get('servers/:serverId/channels/:channelId/webhooks')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get webhooks' })
    @ApiResponse({ status: 200, description: 'Webhooks retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    public async getWebhooks(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: ExpressRequest,
    ): Promise<Record<string, unknown>[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            throw new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const channel = await this.channelRepo.findByIdAndServer(
            channelId,
            serverId,
        );
        if (!channel) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
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
    @Post('servers/:serverId/channels/:channelId/webhooks')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create webhook' })
    @ApiResponse({ status: 201, description: 'Webhook created' })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    public async createWebhook(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: ExpressRequest,
        @Body() body: CreateWebhookRequestDTO,
    ): Promise<IWebhook> {
        const user = (req as ExpressRequest & { user: JWTPayload }).user;
        const userId = user.id;
        const username = user.username;

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            throw new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const channel = await this.channelRepo.findByIdAndServer(
            channelId,
            serverId,
        );
        if (!channel) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        let token: string;
        do {
            token = generateWebhookToken();
            if (!token) {
                throw new InternalServerErrorException(
                    ErrorMessages.WEBHOOK.TOKEN_GENERATION_FAILED,
                );
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

        return webhook;
    }

    // Delete a webhook
    @Delete('servers/:serverId/channels/:channelId/webhooks/:webhookId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete webhook' })
    @ApiResponse({ status: 200, description: 'Webhook deleted' })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    @ApiResponse({ status: 404, description: ErrorMessages.WEBHOOK.NOT_FOUND })
    public async deleteWebhook(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('webhookId') webhookId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageWebhooks',
            ))
        ) {
            throw new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN);
        }

        const webhook = await this.webhookRepo.findById(webhookId);
        if (
            !webhook ||
            webhook.serverId.toString() !== serverId ||
            webhook.channelId.toString() !== channelId
        ) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        await this.webhookRepo.delete(webhookId);

        return { message: 'Webhook deleted successfully' };
    }

    // Upload webhook avatar
    @Post('servers/:serverId/channels/:channelId/webhooks/:webhookId/avatar')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @UseInterceptors(FileInterceptor('avatar', { storage }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                avatar: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload webhook avatar' })
    @ApiResponse({ status: 201, description: 'Avatar uploaded' })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    public async uploadWebhookAvatar(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('webhookId') webhookId: string,
        @Req() req: ExpressRequest,
        @UploadedFile() avatar: Express.Multer.File,
    ): Promise<{ avatarUrl: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const canManage = await this.permissionService.hasPermission(
            serverId,
            userId,
            'manageWebhooks',
        );

        const webhook = await this.webhookRepo.findById(webhookId);
        if (
            !webhook ||
            webhook.serverId.toString() !== serverId ||
            webhook.channelId.toString() !== channelId
        ) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        if (!canManage) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            );
        }

        if (!avatar) {
            throw new BadRequestException(ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const filename = `${webhookId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = avatar.path || avatar.buffer;
        if (!input) {
            throw new InternalServerErrorException(
                ErrorMessages.FILE.DATA_MISSING,
            );
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
    @Get('webhooks/avatar/:filename')
    @ApiOperation({ summary: 'Get webhook avatar' })
    @ApiResponse({ status: 200, description: 'Avatar retrieved' })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.WEBHOOK.AVATAR_NOT_FOUND,
    })
    public async getWebhookAvatar(
        @Param() params: FilenameParamDTO,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { filename } = params;

        const filepath = path.join(this.UPLOADS_DIR, filename);

        if (!fs.existsSync(filepath)) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.AVATAR_NOT_FOUND);
        }

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.gif') {
            res.set({
                'Content-Type': 'image/gif',
            });
        } else {
            res.set({
                'Content-Type': 'image/png',
            });
        }

        const file = fs.createReadStream(filepath);
        return new StreamableFile(file);
    }

    // Execute a webhook (public endpoint)
    // Uses a 128-character token for authentication instead of JWT
    @Post('webhooks/:token')
    @ApiOperation({ summary: 'Execute webhook' })
    @ApiResponse({ status: 201, description: 'Webhook executed' })
    @ApiResponse({
        status: 401,
        description: ErrorMessages.WEBHOOK.INVALID_TOKEN,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.WEBHOOK.NOT_FOUND })
    public async executeWebhook(
        @Param() params: WebhookTokenParamDTO,
        @Body() body: ExecuteWebhookRequestDTO,
    ): Promise<{ id: string; timestamp: Date }> {
        const { token } = params;

        const webhook = await this.webhookRepo.findByToken(token);
        if (!webhook) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        const { content, username, avatarUrl } = body;

        const webhookUsername = username || webhook.name;
        const webhookAvatarUrl = avatarUrl || webhook.avatarUrl;

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
            text: content,
            isWebhook: true,
            webhookUsername,
            webhookAvatarUrl: webhookAvatarUrl || undefined,
        });

        await this.channelRepo.updateLastMessageAt(
            webhook.channelId.toString(),
        );
        messagesSentCounter.labels('webhook').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const messagePayload: IMessageServerEvent = {
            type: 'message_server',
            payload: {
                messageId: message._id.toString(),
                serverId: webhook.serverId.toString(),
                channelId: webhook.channelId.toString(),
                senderId: webhookSystemUserId.toHexString(),
                senderUsername: webhookUsername,
                text: content,
                createdAt:
                    message.createdAt instanceof Date
                        ? message.createdAt.toISOString()
                        : new Date().toISOString(),
                isEdited: false,
                isWebhook: true,
                webhookUsername,
                webhookAvatarUrl: webhookAvatarUrl || undefined,
            },
        };
        this.wsServer.broadcastToChannel(
            webhook.channelId.toString(),
            messagePayload,
        );

        const unreadPayload: IChannelUnreadUpdatedEvent = {
            type: 'channel_unread_updated',
            payload: {
                serverId: webhook.serverId.toString(),
                channelId: webhook.channelId.toString(),
                lastMessageAt:
                    message.createdAt instanceof Date
                        ? message.createdAt.toISOString()
                        : new Date().toISOString(),
                senderId: webhookSystemUserId.toHexString(),
            },
        };
        this.wsServer.broadcastToServer(
            webhook.serverId.toString(),
            unreadPayload,
        );

        return {
            id: message._id.toString(),
            timestamp: message.createdAt,
        };
    }
}
