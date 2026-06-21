import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Headers,
    Param,
    UseGuards,
    Req,
    Inject,
    UseInterceptors,
    UploadedFile,
    Res,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerErrorException,
    StreamableFile,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import {
    WebhookResponseDTO,
    SimpleMessageResponseDTO,
    AvatarUploadResponseDTO,
    WebhookExecuteResponseDTO,
} from './dto/webhook.response.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { TYPES } from '@/di/types';
import { getDocumentIdString } from '@/utils/mongooseId';
import type {
    IWebhookRepository,
    IWebhook,
} from '@/di/interfaces/IWebhookRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import { EmbedService } from '@/services/EmbedService';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { generateWebhookToken } from '@/services/WebhookService';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type {
    IMessageServerEvent,
    IMessageServerEditedEvent,
    IMessageServerDeletedEvent,
    IChannelUnreadUpdatedEvent,
} from '@/ws/protocol/events/messages';
import { messagesSentCounter, websocketMessagesCounter } from '@/utils/metrics';
import type { Request as ExpressRequest, Response } from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { ErrorMessages } from '@/constants/errorMessages';
import { MAX_MESSAGE_LENGTH } from '@/config/env';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { IMessageSearchService } from '@/di/interfaces/IMessageSearchService';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { JWTPayload } from '@/utils/jwt';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import {
    CreateWebhookRequestDTO,
    ExecuteWebhookRequestDTO,
    WebhookTokenParamDTO,
    WebhookMessageParamDTO,
    FilenameParamDTO,
} from './dto/webhook.request.dto';
import { imageFileFilter, imageUploadLimits, storage } from '@/config/multer';
import { processAndSaveImage, ImagePresets } from '@/utils/imageProcessing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

type HeaderValue = string | string[] | undefined;
type TranslatedWebhookBody = ExecuteWebhookRequestDTO & {
    noEmbeds?: boolean;
};

interface GitHubWebhookPayload {
    action?: string;
    sender?: {
        login?: string;
        avatar_url?: string;
        html_url?: string;
    };
    repository?: {
        full_name?: string;
        html_url?: string;
        default_branch?: string;
    };
    ref?: string;
    before?: string;
    after?: string;
    commits?: Array<{
        id?: string;
        message?: string;
        url?: string;
        author?: {
            name?: string;
            username?: string;
        };
    }>;
    pull_request?: {
        title?: string;
        html_url?: string;
        number?: number;
        merged?: boolean;
        user?: {
            login?: string;
        };
    };
    issue?: {
        title?: string;
        html_url?: string;
        number?: number;
        user?: {
            login?: string;
        };
    };
    comment?: {
        html_url?: string;
        user?: {
            login?: string;
        };
    };
    release?: {
        name?: string;
        tag_name?: string;
        html_url?: string;
        author?: {
            login?: string;
        };
    };
    hook?: {
        type?: string;
    };
    zen?: string;
}

@Controller('api/v1')
@ApiTags('Webhooks')
export class WebhookController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'webhooks',
    );

    public constructor(
        @Inject(TYPES.WebhookRepository)
        private webhookRepo: IWebhookRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: IWsServer,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
        @Inject(TYPES.EmbedService)
        private embedService: EmbedService,
        @Inject(TYPES.MessageSearchService)
        private searchService: IMessageSearchService,
    ) {
        // Ensure the uploads directory exists for webhook avatars
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    private async allowlistWebhookAvatarUrl(
        webhookAvatarUrl?: string,
    ): Promise<void> {
        if (
            webhookAvatarUrl === undefined ||
            !webhookAvatarUrl.startsWith('https://')
        ) {
            return;
        }

        const hash = crypto
            .createHash('sha256')
            .update(webhookAvatarUrl)
            .digest('hex');
        await this.redisService
            .getClient()
            .set(
                `proxy:allow:${hash}`,
                webhookAvatarUrl,
                'EX',
                60 * 60 * 24 * 7,
            );
    }

    private validateWebhookMessageContent(content?: string): void {
        if (content !== undefined && content.length > MAX_MESSAGE_LENGTH) {
            throw new BadRequestException(
                `Message content must be at most ${MAX_MESSAGE_LENGTH} characters`,
            );
        }
    }

    private getHeader(headers: Record<string, HeaderValue>, name: string) {
        const value = headers[name.toLowerCase()] ?? headers[name];
        return Array.isArray(value) ? value[0] : value;
    }

    private isGitHubWebhook(headers: Record<string, HeaderValue>): boolean {
        const userAgent = this.getHeader(headers, 'user-agent');
        const event = this.getHeader(headers, 'x-github-event');

        return (
            event !== undefined ||
            userAgent?.startsWith('GitHub-Hookshot/') === true
        );
    }

    private getGitHubActor(payload: GitHubWebhookPayload): string {
        return payload.sender?.login ?? 'GitHub';
    }

    private getGitHubRepo(payload: GitHubWebhookPayload): string {
        return payload.repository?.full_name ?? 'unknown repository';
    }

    private getGitHubBranch(ref?: string): string | undefined {
        return ref?.replace(/^refs\/heads\//, '');
    }

    private formatGitHubCommit(
        commit: NonNullable<GitHubWebhookPayload['commits']>[number],
    ): string {
        const sha = commit.id?.slice(0, 7) ?? 'commit';
        const message = commit.message?.split('\n')[0] ?? 'No commit message';
        const author = commit.author?.username ?? commit.author?.name;
        const label =
            commit.url !== undefined ? `[${sha}](${commit.url})` : sha;

        return author !== undefined
            ? `- ${label} ${message} - ${author}`
            : `- ${label} ${message}`;
    }

    private translateGitHubWebhook(
        body: GitHubWebhookPayload,
        headers: Record<string, HeaderValue>,
    ): TranslatedWebhookBody {
        const event = this.getHeader(headers, 'x-github-event') ?? 'github';
        const repo = this.getGitHubRepo(body);
        const actor = this.getGitHubActor(body);
        const action = body.action;
        const repoLink =
            body.repository?.html_url !== undefined
                ? `[${repo}](${body.repository.html_url})`
                : repo;
        let content: string;

        switch (event) {
            case 'push': {
                const branch =
                    this.getGitHubBranch(body.ref) ??
                    body.repository?.default_branch ??
                    'unknown branch';
                const commits = body.commits ?? [];
                const commitSummary =
                    commits.length === 1
                        ? '1 commit'
                        : `${commits.length} commits`;
                const commitLines = commits
                    .slice(0, 5)
                    .map((commit) => this.formatGitHubCommit(commit));
                const compareUrl =
                    body.repository?.html_url !== undefined &&
                    body.before !== undefined &&
                    body.after !== undefined
                        ? `${body.repository.html_url}/compare/${body.before}...${body.after}`
                        : undefined;
                const summary =
                    compareUrl !== undefined
                        ? `[${commitSummary}](${compareUrl})`
                        : commitSummary;

                content = `**${actor}** pushed ${summary} to \`${branch}\` in ${repoLink}`;
                if (commitLines.length > 0) {
                    content += `\n${commitLines.join('\n')}`;
                }
                break;
            }
            case 'pull_request': {
                const pull = body.pull_request;
                const verb =
                    action === 'closed' && pull?.merged === true
                        ? 'merged'
                        : (action ?? 'updated');
                const number =
                    pull?.number !== undefined
                        ? `#${pull.number}`
                        : 'a pull request';
                const title = pull?.title ?? 'Untitled pull request';
                const link =
                    pull?.html_url !== undefined
                        ? `[${number}: ${title}](${pull.html_url})`
                        : `${number}: ${title}`;

                content = `**${actor}** ${verb} pull request ${link} in ${repoLink}`;
                break;
            }
            case 'issues': {
                const issue = body.issue;
                const number =
                    issue?.number !== undefined
                        ? `#${issue.number}`
                        : 'an issue';
                const title = issue?.title ?? 'Untitled issue';
                const link =
                    issue?.html_url !== undefined
                        ? `[${number}: ${title}](${issue.html_url})`
                        : `${number}: ${title}`;

                content = `**${actor}** ${action ?? 'updated'} issue ${link} in ${repoLink}`;
                break;
            }
            case 'issue_comment': {
                const issue = body.issue;
                const number =
                    issue?.number !== undefined
                        ? `#${issue.number}`
                        : 'an issue';
                const title = issue?.title ?? 'Untitled issue';
                const link =
                    body.comment?.html_url !== undefined
                        ? `[${number}: ${title}](${body.comment.html_url})`
                        : `${number}: ${title}`;

                content = `**${actor}** ${action ?? 'updated'} a comment on issue ${link} in ${repoLink}`;
                break;
            }
            case 'release': {
                const release = body.release;
                const title =
                    release?.name ?? release?.tag_name ?? 'Untitled release';
                const link =
                    release?.html_url !== undefined
                        ? `[${title}](${release.html_url})`
                        : title;

                content = `**${actor}** ${action ?? 'updated'} release ${link} in ${repoLink}`;
                break;
            }
            case 'ping':
                content = `GitHub webhook connected for ${repoLink}${
                    body.zen !== undefined ? `\n_${body.zen}_` : ''
                }`;
                break;
            default:
                content = `**${actor}** triggered GitHub \`${event}\`${
                    action !== undefined ? ` (${action})` : ''
                } in ${repoLink}`;
                break;
        }

        return {
            content: content.slice(0, MAX_MESSAGE_LENGTH),
            username: 'GitHub',
            avatarUrl: body.sender?.avatar_url,
            noEmbeds: true,
        };
    }

    private async validateSerchatWebhookBody(
        body: Record<string, unknown>,
    ): Promise<ExecuteWebhookRequestDTO> {
        const dto = plainToInstance(ExecuteWebhookRequestDTO, body);
        const errors = await validate(dto, {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

        if (errors.length > 0) {
            throw new BadRequestException(errors);
        }

        return dto;
    }

    @Get('servers/:serverId/channels/:channelId/webhooks')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get webhooks' })
    @ApiOkResponse({
        type: [WebhookResponseDTO],
        description: 'Webhooks retrieved',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    @ApiResponse({ status: 404, description: ErrorMessages.CHANNEL.NOT_FOUND })
    public async getWebhooks(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ): Promise<Record<string, unknown>[]> {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageWebhooks',
            new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN),
        );

        const channel = await this.channelRepo.findByIdAndServer(
            channelOid,
            serverOid,
        );
        if (channel === null) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const webhooks = await this.webhookRepo.findByChannelId(channelOid);
        return webhooks.map((w) => ({
            id: getDocumentIdString(w),
            name: w.name,
            token: w.token,
            avatarUrl: w.avatarUrl,
            createdBy: w.createdBy,
            createdAt: w.createdAt,
        }));
    }

    @Post('servers/:serverId/channels/:channelId/webhooks')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create webhook' })
    @ApiResponse({
        status: 201,
        type: WebhookResponseDTO,
        description: 'Webhook created',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    public async createWebhook(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
        @Body() body: CreateWebhookRequestDTO,
    ): Promise<IWebhook> {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageWebhooks',
            new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN),
        );

        const channel = await this.channelRepo.findByIdAndServer(
            channelOid,
            serverOid,
        );
        if (channel === null) {
            throw new NotFoundException(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        let token: string;
        do {
            token = generateWebhookToken();
            if (token === '') {
                throw new InternalServerErrorException(
                    ErrorMessages.WEBHOOK.TOKEN_GENERATION_FAILED,
                );
            }
        } while (await this.webhookRepo.findByToken(token));

        const webhook = await this.webhookRepo.create({
            serverId: serverOid,
            channelId: channelOid,
            name: body.name.trim(),
            token,
            avatarUrl: body.avatarUrl?.trim() ?? undefined,
            createdBy: userOid,
        });

        return webhook;
    }

    @Delete('servers/:serverId/channels/:channelId/webhooks/:webhookId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete webhook' })
    @ApiOkResponse({
        type: SimpleMessageResponseDTO,
        description: 'Webhook deleted',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    @ApiResponse({ status: 404, description: ErrorMessages.WEBHOOK.NOT_FOUND })
    public async deleteWebhook(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('webhookId') webhookId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);
        const webhookOid = new Types.ObjectId(webhookId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageWebhooks',
            new ForbiddenException(ErrorMessages.WEBHOOK.FORBIDDEN),
        );

        const webhook = await this.webhookRepo.findById(webhookOid);
        if (
            webhook === null ||
            !webhook.serverId.equals(serverOid) ||
            !webhook.channelId.equals(channelOid)
        ) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        await this.webhookRepo.delete(webhookOid);

        return { message: 'Webhook deleted successfully' };
    }

    @Post('servers/:serverId/channels/:channelId/webhooks/:webhookId/avatar')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @UseInterceptors(
        FileInterceptor('avatar', {
            storage,
            fileFilter: imageFileFilter,
            limits: imageUploadLimits,
        }),
    )
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
    @ApiResponse({
        status: 201,
        type: AvatarUploadResponseDTO,
        description: 'Avatar uploaded',
    })
    @ApiResponse({ status: 403, description: ErrorMessages.WEBHOOK.FORBIDDEN })
    public async uploadWebhookAvatar(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Param('webhookId') webhookId: string,
        @CurrentUser('id') userId: string,
        @UploadedFile() avatar: Express.Multer.File,
    ): Promise<{ avatarUrl: string }> {
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);
        const webhookOid = new Types.ObjectId(webhookId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.MEMBER.NOT_FOUND);
        }

        const webhook = await this.webhookRepo.findById(webhookOid);
        if (
            webhook === null ||
            !webhook.serverId.equals(serverOid) ||
            !webhook.channelId.equals(channelOid)
        ) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        await this.permissionService.requirePermission(
            serverOid,
            userOid,
            'manageWebhooks',
            new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            ),
        );

        const filename = `${webhookId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = avatar.path || avatar.buffer;

        await processAndSaveImage(
            input,
            filepath,
            ImagePresets.webhookAvatar(),
        );

        if (avatar.path && fs.existsSync(avatar.path)) {
            fs.unlinkSync(avatar.path);
        }

        const avatarUrl = `/api/v1/webhooks/avatar/${filename}`;
        await this.webhookRepo.update(webhookOid, { avatarUrl });

        return { avatarUrl };
    }

    @Get('webhooks/avatar/:filename')
    @ApiOperation({ summary: 'Get webhook avatar' })
    @ApiOkResponse({
        description: 'Avatar retrieved',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
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

    @Post('webhooks/:token')
    @ApiOperation({ summary: 'Execute webhook' })
    @ApiResponse({
        status: 201,
        type: WebhookExecuteResponseDTO,
        description: 'Webhook executed',
    })
    @ApiResponse({
        status: 401,
        description: ErrorMessages.WEBHOOK.INVALID_TOKEN,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.WEBHOOK.NOT_FOUND })
    public async executeWebhook(
        @Param() params: WebhookTokenParamDTO,
        @Body() body: Record<string, unknown>,
        @Headers() headers: Record<string, HeaderValue> = {},
    ): Promise<{ id: string; timestamp: Date }> {
        const { token } = params;

        const webhook = await this.webhookRepo.findByToken(token);
        if (webhook === null) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        const translatedBody: TranslatedWebhookBody = this.isGitHubWebhook(
            headers,
        )
            ? this.translateGitHubWebhook(body as GitHubWebhookPayload, headers)
            : await this.validateSerchatWebhookBody(body);

        const { content, username, avatarUrl, embeds, components } =
            translatedBody;
        if (components !== undefined && components.length > 0) {
            throw new ForbiddenException(
                'Webhooks cannot send messages with components',
            );
        }
        this.validateWebhookMessageContent(content);

        const webhookUsername = username ?? webhook.name;
        const webhookAvatarUrl = avatarUrl ?? webhook.avatarUrl;

        await this.allowlistWebhookAvatarUrl(webhookAvatarUrl);

        const webhookSystemUserId = new mongoose.Types.ObjectId(
            '000000000000000000000000',
        );

        const message = await this.serverMessageRepo.create({
            serverId: webhook.serverId,
            channelId: webhook.channelId,
            senderId: webhookSystemUserId,
            text: content ?? '',
            isWebhook: true,
            webhookUsername,
            webhookAvatarUrl: webhookAvatarUrl ?? undefined,
            embeds,
            noEmbeds: translatedBody.noEmbeds,
        });

        await this.channelRepo.updateLastMessageAt(webhook.channelId);
        messagesSentCounter.labels('webhook').inc();
        websocketMessagesCounter.labels('server_message', 'outbound').inc();

        const messagePayload: IMessageServerEvent = {
            type: 'message_server',
            payload: {
                messageId: getDocumentIdString(message),
                id: getDocumentIdString(message),
                serverId: webhook.serverId.toString(),
                channelId: webhook.channelId.toString(),
                senderId: webhookSystemUserId.toHexString(),
                senderIsBot: true,
                senderUsername: webhookUsername,
                text: content ?? '',
                createdAt:
                    message.createdAt instanceof Date
                        ? message.createdAt.toISOString()
                        : new Date().toISOString(),
                isEdited: false,
                isPinned: false,
                isSticky: false,
                isWebhook: true,
                webhookUsername,
                webhookAvatarUrl: webhookAvatarUrl ?? undefined,
                embeds: embeds ?? [],
                components: [],
                attachments: message.attachments || [],
                reactions: [],
                interaction: null,
                stickerId: message.stickerId?.toString() ?? null,
                poll: message.poll ?? null,
            },
        };
        this.wsServer.broadcastToChannel(
            webhook.channelId.toString(),
            messagePayload,
        );

        await this.wsServer.broadcastToServerWithPermission(
            webhook.serverId.toString(),
            messagePayload,
            {
                type: 'channel',
                targetId: webhook.channelId.toString(),
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
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

        if (
            translatedBody.noEmbeds !== true &&
            message.text &&
            message.text.includes('http')
        ) {
            Promise.resolve()
                .then(() => this.embedService.processServerMessage(message))
                .catch((err) =>
                    this.logger.error(
                        'Failed to process embeds for webhook message',
                        err.stack,
                    ),
                );
        }

        this.searchService
            .indexChannelMessage(message)
            .catch((err: unknown) => {
                this.logger.error(
                    '[WebhookController] Failed to index webhook message',
                    err,
                );
            });

        return {
            id: getDocumentIdString(message),
            timestamp: message.createdAt,
        };
    }

    @Patch('webhooks/:token/messages/:messageId')
    @ApiOperation({ summary: 'Edit webhook message' })
    @ApiOkResponse({
        type: SimpleMessageResponseDTO,
        description: 'Webhook message edited',
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async editWebhookMessage(
        @Param() params: WebhookMessageParamDTO,
        @Body() body: ExecuteWebhookRequestDTO,
    ): Promise<{ message: string }> {
        const { token, messageId } = params;
        const webhook = await this.webhookRepo.findByToken(token);
        if (webhook === null || !Types.ObjectId.isValid(messageId)) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(
            new Types.ObjectId(messageId),
        );
        if (
            message === null ||
            message.isWebhook !== true ||
            !message.serverId.equals(webhook.serverId) ||
            !message.channelId.equals(webhook.channelId)
        ) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const webhookUsername = body.username ?? message.webhookUsername;
        const webhookAvatarUrl = body.avatarUrl ?? message.webhookAvatarUrl;
        this.validateWebhookMessageContent(body.content);
        const updateData = {
            ...(body.content !== undefined ? { text: body.content } : {}),
            ...(body.username !== undefined ? { webhookUsername } : {}),
            ...(body.avatarUrl !== undefined ? { webhookAvatarUrl } : {}),
            ...(body.embeds !== undefined ? { embeds: body.embeds } : {}),
            isEdited: true,
            editedAt: new Date(),
        };

        if (
            body.content === undefined &&
            body.username === undefined &&
            body.avatarUrl === undefined &&
            body.embeds === undefined
        ) {
            throw new BadRequestException(
                'No webhook message changes provided',
            );
        }

        await this.allowlistWebhookAvatarUrl(webhookAvatarUrl);

        const updatedMessage = await this.serverMessageRepo.update(
            new Types.ObjectId(messageId),
            updateData,
        );
        if (updatedMessage === null) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        const event: IMessageServerEditedEvent = {
            type: 'message_server_edited',
            payload: {
                messageId,
                serverId: webhook.serverId.toString(),
                channelId: webhook.channelId.toString(),
                text: updatedMessage.text,
                editedAt:
                    updatedMessage.editedAt instanceof Date
                        ? updatedMessage.editedAt.toISOString()
                        : new Date().toISOString(),
                isEdited: true,
                embeds: updatedMessage.embeds || [],
                components: updatedMessage.components || [],
                attachments: updatedMessage.attachments || [],
            },
        };

        this.wsServer.broadcastToChannel(webhook.channelId.toString(), event);

        await this.wsServer.broadcastToServerWithPermission(
            webhook.serverId.toString(),
            event,
            {
                type: 'channel',
                targetId: webhook.channelId.toString(),
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );

        if (updatedMessage.text && updatedMessage.text.includes('http')) {
            Promise.resolve()
                .then(() =>
                    this.embedService.processServerMessage(updatedMessage),
                )
                .catch((err) =>
                    this.logger.error(
                        'Failed to process embeds for edited webhook message',
                        err.stack,
                    ),
                );
        }

        return { message: 'Webhook message edited successfully' };
    }

    @Delete('webhooks/:token/messages/:messageId')
    @ApiOperation({ summary: 'Delete webhook message' })
    @ApiOkResponse({
        type: SimpleMessageResponseDTO,
        description: 'Webhook message deleted',
    })
    @ApiResponse({ status: 404, description: ErrorMessages.MESSAGE.NOT_FOUND })
    public async deleteWebhookMessage(
        @Param() params: WebhookMessageParamDTO,
    ): Promise<{ message: string }> {
        const { token, messageId } = params;
        const webhook = await this.webhookRepo.findByToken(token);
        if (webhook === null || !Types.ObjectId.isValid(messageId)) {
            throw new NotFoundException(ErrorMessages.WEBHOOK.NOT_FOUND);
        }

        const message = await this.serverMessageRepo.findById(
            new Types.ObjectId(messageId),
            true,
        );
        if (
            message === null ||
            message.isWebhook !== true ||
            !message.serverId.equals(webhook.serverId) ||
            !message.channelId.equals(webhook.channelId)
        ) {
            throw new NotFoundException(ErrorMessages.MESSAGE.NOT_FOUND);
        }

        if (message.deletedAt === undefined) {
            await this.serverMessageRepo.delete(new Types.ObjectId(messageId));
        }

        const event: IMessageServerDeletedEvent = {
            type: 'message_server_deleted',
            payload: {
                messageId,
                serverId: webhook.serverId.toString(),
                channelId: webhook.channelId.toString(),
                hard: true,
            },
        };

        this.wsServer.broadcastToChannel(webhook.channelId.toString(), event);

        await this.wsServer.broadcastToServerWithPermission(
            webhook.serverId.toString(),
            event,
            {
                type: 'channel',
                targetId: webhook.channelId.toString(),
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );

        return { message: 'Webhook message deleted successfully' };
    }
}
