import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    Inject,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { isValidSnowflakeId } from '@/utils/snowflake';
import type {
    IChannelRepository,
    IChannel,
} from '@/di/interfaces/IChannelRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type {
    ICategoryRepository,
    ICategory,
} from '@/di/interfaces/ICategoryRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import { PermissionService } from '@/permissions/PermissionService';
import { ExportService } from '@/services/ExportService';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { isPermissionKey } from '@/permissions/types';
import type { ILogger } from '@/di/interfaces/ILogger';

import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import { ErrorMessages } from '@/constants/errorMessages';
import {
    CreateChannelRequestDTO,
    UpdateChannelRequestDTO,
    ReorderChannelsRequestDTO,
    CreateCategoryRequestDTO,
    UpdateCategoryRequestDTO,
    ReorderCategoriesRequestDTO,
    UpdatePermissionsRequestDTO,
} from './dto/server-channel.request.dto';
import {
    ChannelWithReadResponseDTO,
    ChannelStatsResponseDTO,
    ChannelResponseDTO,
    CategoryResponseDTO,
    MessageResponseDTO,
    ReorderResponseDTO,
    PermissionsResponseDTO,
} from './dto/server-channel.response.dto';
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerChannelController {
    public constructor(
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @Inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ExportService)
        private exportService: ExportService,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
    ) {}

    @Get('channels')
    @ApiOperation({ summary: 'Get server channels' })
    @ApiResponse({ status: 200, type: [ChannelWithReadResponseDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getChannels(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<ChannelWithReadResponseDTO[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channels = await this.channelRepo.findByServerId(serverId);

        const categoryIds = [
            ...new Map(
                channels
                    .map((c) => c.categoryId)
                    .filter(
                        (id): id is string => id !== null && id !== undefined,
                    )
                    .map((id) => [id, id] as const),
            ).values(),
        ];

        const [channelPermissionMap, categoryPermissionMap] = await Promise.all(
            [
                this.permissionService.hasChannelPermissions(
                    serverId,
                    userId,
                    channels.map((c) => c.snowflakeId),
                    'viewChannels',
                ),
                this.permissionService.hasCategoryPermissions(
                    serverId,
                    userId,
                    categoryIds,
                    'viewCategories',
                ),
            ],
        );

        const visibleChannels: IChannel[] = [];
        for (const c of channels) {
            const canViewChannel =
                channelPermissionMap.get(c.snowflakeId) === true;

            const categoryId = c.categoryId ?? null;
            const canViewParentCategory =
                categoryId === null ||
                categoryPermissionMap.get(categoryId) === true;

            if (canViewChannel && canViewParentCategory) {
                visibleChannels.push(c);
            }
        }

        const reads = await this.serverChannelReadRepo.findByServerAndUser(
            serverId,
            userId,
        );
        const readMap = new Map<string, Date>();
        reads.forEach((read) => {
            readMap.set(read.channelId.toString(), read.lastReadAt);
        });

        const mappedChannels = visibleChannels.map(
            async (channel: IChannel) => {
                const channelId = channel.snowflakeId;
                const lastMessageAt: Date | null =
                    channel.lastMessageAt !== undefined
                        ? channel.lastMessageAt
                        : null;
                const lastReadAt: Date | undefined = channelId
                    ? readMap.get(channelId)
                    : undefined;

                let slowModeNextMessageAllowedAt: string | null = null;
                if (channel.slowMode !== undefined && channel.slowMode > 0) {
                    const lastMessage =
                        await this.serverMessageRepo.findLastByChannelAndUser(
                            channelId,
                            userId,
                        );
                    if (lastMessage !== null) {
                        const lastSentAt =
                            lastMessage.createdAt instanceof Date
                                ? lastMessage.createdAt
                                : new Date(lastMessage.createdAt);
                        const nextAllowedAt = new Date(
                            lastSentAt.getTime() + channel.slowMode * 1000,
                        );
                        if (nextAllowedAt > new Date()) {
                            slowModeNextMessageAllowedAt =
                                nextAllowedAt.toISOString();
                        }
                    }
                }

                return {
                    ...channel,
                    id: channel.snowflakeId,
                    serverId: channel.serverId.toString(),
                    categoryId: channel.categoryId ?? null,
                    lastMessageAt: lastMessageAt
                        ? lastMessageAt.toISOString()
                        : null,
                    lastReadAt:
                        lastReadAt !== undefined
                            ? lastReadAt.toISOString()
                            : null,
                    slowMode: channel.slowMode,
                    slowModeNextMessageAllowedAt,
                    permissions:
                        await this.permissionService.normalizePermissionMap(
                            serverId,
                            channel.permissions,
                        ),
                };
            },
        );

        return await Promise.all(mappedChannels);
    }

    @Get('categories')
    @ApiOperation({ summary: 'Get server categories' })
    @ApiResponse({ status: 200, type: [CategoryResponseDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getCategories(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<ICategory[]> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const categories = await this.categoryRepo.findByServerId(serverId);
        const categoryIds = categories.map((c) => c.snowflakeId);
        const permissionMap =
            await this.permissionService.hasCategoryPermissions(
                serverId,
                userId,
                categoryIds,
                'viewCategories',
            );

        return categories.filter(
            (category) => permissionMap.get(category.snowflakeId) === true,
        );
    }

    @Post('channels')
    @ApiOperation({ summary: 'Create channel' })
    @ApiResponse({ status: 201, type: ChannelResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createChannel(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: CreateChannelRequestDTO,
    ): Promise<IChannel> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const maxPositionChannel =
            await this.channelRepo.findMaxPositionByServerId(serverId);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionChannel !== null
                  ? maxPositionChannel.position + 1
                  : 0;

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        if (body.permissions !== undefined) {
            for (const id in body.permissions) {
                filteredPermissions[id] = {};
                for (const key in body.permissions[id]) {
                    if (isPermissionKey(key)) {
                        filteredPermissions[id][key] = body.permissions[id][
                            key
                        ] as boolean;
                    }
                }
            }
        } else {
            // Default permission: allow @everyone to send messages
            const everyoneRole =
                await this.permissionService.normalizePermissionMap(serverId, {
                    everyone: { sendMessages: true },
                });
            Object.assign(filteredPermissions, everyoneRole);
        }

        const channel = await this.channelRepo.create({
            serverId: serverId,
            name: body.name,
            type: body.type ?? 'text',
            position: finalPosition,
            categoryId:
                body.categoryId !== undefined && body.categoryId !== ''
                    ? body.categoryId
                    : null,
            permissions: filteredPermissions,
            ...(body.description !== undefined &&
                body.description !== '' && { description: body.description }),
            ...(body.icon !== undefined &&
                body.icon !== '' && { icon: body.icon }),
            ...(body.emoji !== undefined &&
                body.emoji !== '' && { emoji: body.emoji }),
            ...(body.emojiType !== undefined && { emojiType: body.emojiType }),
            ...(body.link !== undefined &&
                body.link !== '' && { link: body.link }),
            ...(body.slowMode !== undefined && { slowMode: body.slowMode }),
            ...(body.markdownBlockadeRules !== undefined && {
                markdownBlockadeRules: body.markdownBlockadeRules,
            }),
        });

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_created',
            payload: { serverId, channel, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'create_channel',
            targetId: channel.snowflakeId,
            targetType: 'channel',
            metadata: { channelName: channel.name, channelType: channel.type },
        });

        this.permissionService.invalidateCache(serverId);

        return channel;
    }

    @Patch('channels/reorder')
    @ApiOperation({ summary: 'Reorder channels' })
    @ApiOkResponse({
        type: ReorderResponseDTO,
        description: 'Channels reordered',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async reorderChannels(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: ReorderChannelsRequestDTO,
    ): Promise<{ message: string }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const existingChannels =
            await this.channelRepo.findByServerId(serverId);
        const channelMap = new Map(
            existingChannels.map((c) => [c.snowflakeId, c]),
        );

        const changes = [];
        for (const { channelId, position } of body.channelPositions) {
            const oldChannel = channelMap.get(channelId);
            if (oldChannel !== undefined && oldChannel.position !== position) {
                changes.push({
                    field: `Position: ${oldChannel.name}`,
                    before: oldChannel.position,
                    after: position,
                });
            }
            await this.channelRepo.update(channelId, {
                position,
            });
        }

        await Promise.all(
            body.channelPositions.map(({ channelId, position }) =>
                this.wsServer.broadcastToServerWithPermission(
                    serverId.toString(),
                    {
                        type: 'channels_reordered',
                        payload: {
                            serverId,
                            channelPositions: [{ channelId, position }],
                            senderId: userId,
                        },
                    },
                    {
                        type: 'channel',
                        targetId: channelId,
                        permission: 'viewChannels',
                    },
                ),
            ),
        );

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType: 'channels_reordered',
                targetType: 'channel',
                changes,
            });
        }

        this.permissionService.invalidateCache(serverId);

        return { message: 'Channels reordered' };
    }

    @Get('channels/:channelId/stats')
    @ApiOperation({ summary: 'Get channel stats' })
    @ApiResponse({ status: 200, type: ChannelStatsResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async getChannelStats(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ): Promise<ChannelStatsResponseDTO> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const [canView] = await Promise.all([
            this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'viewChannels',
            ),
            this.permissionService.hasChannelPermission(
                serverId,
                userId,
                channelId,
                'connect',
            ),
        ]);

        if (canView !== true) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        if (channel.serverId.toString() !== serverId) {
            throw new ApiError(400, ErrorMessages.CHANNEL.NOT_IN_SERVER);
        }

        const messageCount =
            await this.serverMessageRepo.countByChannelId(channelId);

        return {
            channelId: channel.snowflakeId,
            channelName: channel.name,
            createdAt: channel.createdAt.toISOString(),
            messageCount,
        };
    }

    @Patch('channels/:channelId')
    @ApiOperation({ summary: 'Update channel' })
    @ApiResponse({ status: 200, type: ChannelResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async updateChannel(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
        @Body() body: UpdateChannelRequestDTO,
    ): Promise<IChannel> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const existingChannel = await this.channelRepo.findById(channelId);
        if (
            existingChannel === null ||
            existingChannel.serverId.toString() !== serverId
        ) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const updates: Partial<IChannel> = {};
        if (body.name !== undefined && body.name !== '')
            updates.name = body.name;
        if (body.position !== undefined) updates.position = body.position;
        if (body.categoryId !== undefined)
            updates.categoryId =
                body.categoryId !== null && body.categoryId !== ''
                    ? body.categoryId
                    : null;
        if (body.description !== undefined)
            updates.description = body.description;

        if (body.icon !== undefined) {
            if (existingChannel.type === 'link') {
                throw new ApiError(
                    400,
                    'Cannot set a custom icon for a link channel',
                );
            }
            updates.icon = body.icon;
        }

        if (body.emoji !== undefined) {
            updates.emoji = body.emoji !== '' ? body.emoji : undefined;
            if (body.emoji === '') {
                updates.emojiType = undefined;
            }
        }
        if (body.emojiType !== undefined) updates.emojiType = body.emojiType;

        if (body.slowMode !== undefined) updates.slowMode = body.slowMode;
        if (body.markdownBlockadeRules !== undefined)
            updates.markdownBlockadeRules = body.markdownBlockadeRules;

        if (body.link !== undefined) updates.link = body.link;

        const channel = await this.channelRepo.update(channelId, updates);
        if (channel === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_updated',
            payload: { serverId, channel, senderId: userId },
        });

        const changes = [];
        if (
            body.name !== undefined &&
            body.name !== '' &&
            body.name !== existingChannel.name
        ) {
            changes.push({
                field: 'name',
                before: existingChannel.name,
                after: body.name,
            });
        }
        if (
            body.description !== undefined &&
            body.description !== existingChannel.description
        ) {
            changes.push({
                field: 'description',
                before: existingChannel.description,
                after: body.description,
            });
        }
        if (body.categoryId !== undefined) {
            const oldCatString = existingChannel.categoryId?.toString() ?? null;
            const newCatString =
                body.categoryId !== null && body.categoryId !== ''
                    ? body.categoryId
                    : null;
            if (oldCatString !== newCatString) {
                changes.push({
                    field: 'categoryId',
                    before: oldCatString,
                    after: newCatString,
                });
            }
        }
        if (body.icon !== undefined && body.icon !== existingChannel.icon) {
            changes.push({
                field: 'icon',
                before: existingChannel.icon ?? null,
                after: body.icon ?? null,
            });
        }
        if (body.link !== undefined && body.link !== existingChannel.link) {
            changes.push({
                field: 'link',
                before: existingChannel.link ?? null,
                after: body.link ?? null,
            });
        }
        if (
            body.slowMode !== undefined &&
            body.slowMode !== existingChannel.slowMode
        ) {
            changes.push({
                field: 'slowMode',
                before: existingChannel.slowMode ?? 0,
                after: body.slowMode,
            });
        }
        if (body.emoji !== undefined && body.emoji !== existingChannel.emoji) {
            changes.push({
                field: 'emoji',
                before: existingChannel.emoji ?? null,
                after: body.emoji ?? null,
            });
        }
        if (
            body.emojiType !== undefined &&
            body.emojiType !== existingChannel.emojiType
        ) {
            changes.push({
                field: 'emojiType',
                before: existingChannel.emojiType ?? null,
                after: body.emojiType ?? null,
            });
        }

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType: 'edit_channel',
                targetId: channelId,
                targetType: 'channel',
                changes,
                metadata: { channelName: existingChannel.name },
            });
        }

        this.permissionService.invalidateCache(serverId);

        return channel;
    }

    @Delete('channels/:channelId')
    @ApiOperation({ summary: 'Delete channel' })
    @ApiOkResponse({ type: MessageResponseDTO, description: 'Channel deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async deleteChannel(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const channel = await this.channelRepo.findById(channelId);
        const server = await this.serverRepo.findById(serverId);

        if (channel !== null && server !== null) {
            await this.exportService.handleChannelDeletion(
                channelId,
                channel.name,
                server.name,
            );
        }

        await this.channelRepo.delete(channelId);

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_deleted',
            payload: { serverId, channelId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'delete_channel',
            targetId: channelId,
            targetType: 'channel',
            metadata: { channelName: channel !== null ? channel.name : '' },
        });

        this.permissionService.invalidateCache(serverId);

        return { message: 'Channel deleted' };
    }

    @Post('categories')
    @ApiOperation({ summary: 'Create category' })
    @ApiResponse({ status: 201, type: CategoryResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createCategory(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: CreateCategoryRequestDTO,
    ): Promise<ICategory> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const maxPositionCategory =
            await this.categoryRepo.findMaxPositionByServerId(serverId);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionCategory !== null
                  ? maxPositionCategory.position + 1
                  : 0;

        const category = await this.categoryRepo.create({
            serverId: serverId,
            name: body.name,
            position: finalPosition,
            ...(body.markdownBlockadeRules !== undefined && {
                markdownBlockadeRules: body.markdownBlockadeRules,
            }),
        });

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_created',
            payload: { serverId, category, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'create_category',
            targetId: category.snowflakeId,
            targetType: 'category',
            metadata: {
                categoryName: category.name,
                targetName: category.name,
            },
        });

        this.permissionService.invalidateCache(serverId);

        return category;
    }

    @Patch('categories/reorder')
    @ApiOperation({ summary: 'Reorder categories' })
    @ApiOkResponse({
        type: ReorderResponseDTO,
        description: 'Categories reordered',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async reorderCategories(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @Body() body: ReorderCategoriesRequestDTO,
    ): Promise<{ message: string }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        for (const { categoryId, position } of body.categoryPositions) {
            await this.categoryRepo.update(categoryId, {
                position,
            });
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'categories_reordered',
            payload: {
                serverId,
                categoryPositions: body.categoryPositions,
                senderId: userId,
            },
        });

        this.permissionService.invalidateCache(serverId);

        return { message: 'Categories reordered' };
    }

    @Patch('categories/:categoryId')
    @ApiOperation({ summary: 'Update category' })
    @ApiResponse({ status: 200, type: CategoryResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async updateCategory(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @CurrentUser('id') userId: string,
        @Body() body: UpdateCategoryRequestDTO,
    ): Promise<ICategory> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const updates: Partial<ICategory> = {};
        if (body.name !== undefined && body.name !== '')
            updates.name = body.name;
        if (body.position !== undefined) updates.position = body.position;
        if (body.markdownBlockadeRules !== undefined)
            updates.markdownBlockadeRules = body.markdownBlockadeRules;

        const existingCategory = await this.categoryRepo.findById(categoryId);
        if (existingCategory === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const category = await this.categoryRepo.update(categoryId, updates);
        if (category === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_updated',
            payload: { serverId, category, senderId: userId },
        });

        const changes = [];
        if (
            body.name !== undefined &&
            body.name !== '' &&
            body.name !== existingCategory.name
        ) {
            changes.push({
                field: 'name',
                before: existingCategory.name,
                after: body.name,
            });
        }
        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverId,
                actorId: userId,
                actionType: 'edit_category',
                targetId: categoryId,
                targetType: 'category',
                changes,
                metadata: {
                    categoryName: existingCategory.name,
                    targetName: existingCategory.name,
                },
            });
        }

        this.permissionService.invalidateCache(serverId);

        return category;
    }

    @Delete('categories/:categoryId')
    @ApiOperation({ summary: 'Delete category' })
    @ApiOkResponse({
        type: MessageResponseDTO,
        description: 'Category deleted',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async deleteCategory(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ message: string }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const category = await this.categoryRepo.findById(categoryId);
        if (category === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        await this.categoryRepo.delete(categoryId);

        // Orphan channels by moving them out of the deleted category
        const channels = await this.channelRepo.findByServerId(serverId);
        for (const channel of channels) {
            if (channel.categoryId?.toString() === categoryId) {
                await this.channelRepo.update(channel.snowflakeId, {
                    categoryId: null,
                });
            }
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_deleted',
            payload: { serverId, categoryId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'delete_category',
            targetId: categoryId,
            targetType: 'category',
            metadata: {
                categoryName: category.name,
                targetName: category.name,
            },
        });

        this.permissionService.invalidateCache(serverId);

        return { message: 'Category deleted' };
    }

    @Get('channels/:channelId/permissions')
    @ApiOperation({ summary: 'Get channel permissions' })
    @ApiOkResponse({
        type: PermissionsResponseDTO,
        description: 'Permissions retrieved',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async getChannelPermissions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverId,
            channel.permissions,
        );

        return { permissions: normalized };
    }

    @Patch('channels/:channelId/permissions')
    @ApiOperation({ summary: 'Update channel permissions' })
    @ApiOkResponse({
        type: PermissionsResponseDTO,
        description: 'Permissions updated',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async updateChannelPermissions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @CurrentUser('id') userId: string,
        @Body() body: UpdatePermissionsRequestDTO,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const channel = await this.channelRepo.findById(channelId);
        if (channel === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        const changes = [];

        for (const id in body.permissions) {
            filteredPermissions[id] = {};
            for (const key in body.permissions[id]) {
                if (isPermissionKey(key)) {
                    filteredPermissions[id][key] = body.permissions[id][
                        key
                    ] as boolean;
                }
            }
        }

        const oldPerms = channel.permissions as Record<
            string,
            Record<string, boolean>
        >;
        const roles = await this.roleRepo.findByServerId(serverId);
        const roleMap = new Map(roles.map((r) => [r.snowflakeId, r]));

        const allRoleIds = new Set([
            ...Object.keys(oldPerms),
            ...Object.keys(filteredPermissions),
        ]);

        for (const id of allRoleIds) {
            const roleName =
                id === 'everyone'
                    ? '@everyone'
                    : (roleMap.get(id)?.name ?? `Role ${id}`);
            const oldRolePerms = oldPerms[id] || {};
            const newRolePerms = filteredPermissions[id] || {};

            const allPermKeys = new Set([
                ...Object.keys(oldRolePerms),
                ...Object.keys(newRolePerms),
            ]);

            for (const key of allPermKeys) {
                if (isPermissionKey(key)) {
                    const oldVal = oldRolePerms[key];
                    const newVal = newRolePerms[key];
                    if (oldVal !== newVal) {
                        changes.push({
                            field: `${roleName} - ${key}`,
                            before: oldVal ?? null,
                            after: newVal ?? null,
                        });
                    }
                }
            }
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverId,
            filteredPermissions,
        );

        await this.channelRepo.update(channelId, {
            permissions: normalized,
        });

        this.permissionService.invalidateCache(serverId);

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_permissions_updated',
            payload: {
                serverId,
                channelId,
                permissions: normalized,
                senderId: userId,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'channel_permissions_updated',
            targetId: channelId,
            targetType: 'channel',
            metadata: { channelName: channel.name },
            ...(changes.length > 0 && { changes }),
        });

        return { permissions: normalized };
    }

    @Get('categories/:categoryId/permissions')
    @ApiOperation({ summary: 'Get category permissions' })
    @ApiOkResponse({
        type: PermissionsResponseDTO,
        description: 'Permissions retrieved',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async getCategoryPermissions(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @CurrentUser('id') userId: string,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const category = await this.categoryRepo.findById(categoryId);
        if (category === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverId,
            category.permissions,
        );

        return { permissions: normalized };
    }

    @Patch('categories/:categoryId/permissions')
    @ApiOperation({ summary: 'Update category permissions' })
    @ApiOkResponse({
        type: PermissionsResponseDTO,
        description: 'Permissions updated',
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async updateCategoryPermissions(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @CurrentUser('id') userId: string,
        @Body() body: UpdatePermissionsRequestDTO,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageChannels',
            new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE),
        );

        const category = await this.categoryRepo.findById(categoryId);
        if (category === null) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        const changes = [];

        for (const id in body.permissions) {
            filteredPermissions[id] = {};
            for (const key in body.permissions[id]) {
                if (isPermissionKey(key)) {
                    filteredPermissions[id][key] = body.permissions[id][
                        key
                    ] as boolean;
                }
            }
        }

        const oldPerms = category.permissions as Record<
            string,
            Record<string, boolean>
        >;
        const roles = await this.roleRepo.findByServerId(serverId);
        const roleMap = new Map(roles.map((r) => [r.snowflakeId, r]));

        const allRoleIds = new Set([
            ...Object.keys(oldPerms),
            ...Object.keys(filteredPermissions),
        ]);

        for (const id of allRoleIds) {
            const roleName =
                id === 'everyone'
                    ? '@everyone'
                    : (roleMap.get(id)?.name ?? `Role ${id}`);
            const oldRolePerms = oldPerms[id] || {};
            const newRolePerms = filteredPermissions[id] || {};

            const allPermKeys = new Set([
                ...Object.keys(oldRolePerms),
                ...Object.keys(newRolePerms),
            ]);

            for (const key of allPermKeys) {
                if (isPermissionKey(key)) {
                    const oldVal = oldRolePerms[key];
                    const newVal = newRolePerms[key];
                    if (oldVal !== newVal) {
                        changes.push({
                            field: `${roleName} - ${key}`,
                            before: oldVal ?? null,
                            after: newVal ?? null,
                        });
                    }
                }
            }
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverId,
            filteredPermissions,
        );

        await this.categoryRepo.update(categoryId, {
            permissions: normalized,
        });

        this.permissionService.invalidateCache(serverId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'category_permissions_updated',
            payload: {
                serverId,
                categoryId,
                permissions: normalized,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'category_permissions_updated',
            targetId: categoryId,
            targetType: 'category',
            metadata: { categoryName: category.name },
            ...(changes.length > 0 && { changes }),
        });

        return { permissions: normalized };
    }

    @Get('voice-states')
    @ApiOperation({
        summary: 'Get current voice presence states for the server',
    })
    @ApiResponse({
        status: 200,
        description:
            'Returned voice states mapping channelId to array of userIds',
    })
    public async getVoiceStates(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<Record<string, string[]>> {
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const redis = this.redisService.getClient();
        const pattern = `voice_channel:${serverId}:*`;
        let cursor = '0';
        const keys: string[] = [];

        do {
            const [nextCursor, scannedKeys] = await redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100,
            );
            cursor = nextCursor;
            keys.push(...scannedKeys);
        } while (cursor !== '0');

        const result: Record<string, string[]> = {};
        for (const key of keys) {
            const channelId = key.split(':').pop();
            if (channelId !== undefined && channelId !== '') {
                const members = await redis.smembers(key);
                if (members.length > 0) {
                    const canView =
                        isValidSnowflakeId(channelId) &&
                        (await this.permissionService.hasChannelPermission(
                            serverId,
                            userId,
                            channelId,
                            'viewChannels',
                        ));
                    if (canView) {
                        result[channelId] = members;
                    }
                }
            }
        }

        return result;
    }
}
