import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    Inject,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
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
import { isPermissionKey, Permissions } from '@/permissions/types';
import type { ILogger } from '@/di/interfaces/ILogger';

import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
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
} from './dto/server-channel.response.dto';
@injectable()
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerChannelController {
    constructor(
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
    ) {}

    @Get('channels')
    @ApiOperation({ summary: 'Get server channels' })
    @ApiResponse({ status: 200, type: [ChannelWithReadResponseDTO] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getChannels(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<ChannelWithReadResponseDTO[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channels = await this.channelRepo.findByServerId(serverOid);
        const channelIds = channels.map((c) => c._id);
        const permissionMap =
            await this.permissionService.hasChannelPermissions(
                serverOid,
                userOid,
                channelIds as Types.ObjectId[],
                'viewChannels',
            );

        const visibleChannels: IChannel[] = [];
        for (const c of channels) {
            const canView = permissionMap.get(c._id.toString());
            if (canView) {
                visibleChannels.push(c);
            }
        }

        const reads = await this.serverChannelReadRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        const readMap = new Map<string, Date>();
        reads.forEach((read) => {
            if (read.channelId) {
                readMap.set(read.channelId.toString(), read.lastReadAt);
            }
        });

        const mappedChannels = visibleChannels.map(
            async (channel: IChannel) => {
                const channelId = channel._id?.toString();
                const lastMessageAt: Date | null =
                    channel.lastMessageAt ?? null;
                const lastReadAt: Date | undefined = channelId
                    ? readMap.get(channelId)
                    : undefined;

                let slowModeNextMessageAllowedAt: string | null = null;
                if (channel.slowMode && channel.slowMode > 0) {
                    const lastMessage =
                        await this.serverMessageRepo.findLastByChannelAndUser(
                            new Types.ObjectId(channelId),
                            userOid,
                        );
                    if (lastMessage) {
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
                    _id: channel._id.toString(),
                    serverId: channel.serverId.toString(),
                    categoryId: channel.categoryId?.toString() ?? null,
                    lastMessageAt: lastMessageAt
                        ? lastMessageAt.toISOString()
                        : null,
                    lastReadAt: lastReadAt ? lastReadAt.toISOString() : null,
                    slowMode: channel.slowMode,
                    slowModeNextMessageAllowedAt,
                    permissions:
                        await this.permissionService.normalizePermissionMap(
                            serverOid,
                            channel.permissions as Record<string, Permissions>,
                        ),
                } as unknown as ChannelWithReadResponseDTO;
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
        @Req() req: Request,
    ): Promise<ICategory[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.categoryRepo.findByServerId(serverOid);
    }

    @Post('channels')
    @ApiOperation({ summary: 'Create channel' })
    @ApiResponse({ status: 201, type: ChannelResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createChannel(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: CreateChannelRequestDTO,
    ): Promise<IChannel> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const maxPositionChannel =
            await this.channelRepo.findMaxPositionByServerId(serverOid);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionChannel
                  ? maxPositionChannel.position + 1
                  : 0;

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        if (body.permissions) {
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
                await this.permissionService.normalizePermissionMap(serverOid, {
                    everyone: { sendMessages: true },
                });
            Object.assign(filteredPermissions, everyoneRole);
        }

        const channel = await this.channelRepo.create({
            serverId: serverOid,
            name: body.name,
            type: body.type || 'text',
            position: finalPosition,
            categoryId: body.categoryId
                ? new Types.ObjectId(body.categoryId)
                : null,
            permissions: filteredPermissions,
            ...(body.description && { description: body.description }),
            ...(body.icon && { icon: body.icon }),
            ...(body.link && { link: body.link }),
            ...(body.slowMode !== undefined && { slowMode: body.slowMode }),
        });

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_created',
            payload: { serverId, channel, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'create_channel',
            targetId: channel._id as Types.ObjectId,
            targetType: 'channel',
            metadata: { channelName: channel.name, channelType: channel.type },
        });

        return channel;
    }

    @Patch('channels/reorder')
    @ApiOperation({ summary: 'Reorder channels' })
    @ApiResponse({ status: 200, description: 'Channels reordered' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async reorderChannels(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: ReorderChannelsRequestDTO,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const existingChannels =
            await this.channelRepo.findByServerId(serverOid);
        const channelMap = new Map(
            existingChannels.map((c) => [c._id.toString(), c]),
        );

        const changes = [];
        for (const { channelId, position } of body.channelPositions) {
            const oldChannel = channelMap.get(channelId);
            if (oldChannel && oldChannel.position !== position) {
                changes.push({
                    field: `Position: ${oldChannel.name}`,
                    before: oldChannel.position,
                    after: position,
                });
            }
            await this.channelRepo.update(new Types.ObjectId(channelId), {
                position,
            });
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channels_reordered',
            payload: {
                serverId,
                channelPositions: body.channelPositions,
                senderId: userId,
            },
        });

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'channels_reordered',
                targetType: 'channel',
                changes,
            });
        }

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
        @Req() req: Request,
    ): Promise<ChannelStatsResponseDTO> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        if (
            !(await this.permissionService.hasChannelPermission(
                serverOid,
                userOid,
                channelOid,
                'viewChannels',
            ))
        ) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const channel = await this.channelRepo.findById(channelOid);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        if (channel.serverId.toString() !== serverId) {
            throw new ApiError(400, ErrorMessages.CHANNEL.NOT_IN_SERVER);
        }

        const messageCount =
            await this.serverMessageRepo.countByChannelId(channelOid);

        return {
            channelId: channel._id.toString(),
            channelName: channel.name,
            createdAt:
                channel.createdAt?.toISOString() || new Date().toISOString(),
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
        @Req() req: Request,
        @Body() body: UpdateChannelRequestDTO,
    ): Promise<IChannel> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const existingChannel = await this.channelRepo.findById(channelOid);
        if (
            !existingChannel ||
            existingChannel.serverId.toString() !== serverId
        ) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const updates: Partial<IChannel> = {};
        if (body.name) updates.name = body.name;
        if (body.position !== undefined) updates.position = body.position;
        if (body.categoryId !== undefined)
            updates.categoryId = body.categoryId
                ? new Types.ObjectId(body.categoryId)
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
        if (body.slowMode !== undefined) updates.slowMode = body.slowMode;

        if (body.link !== undefined) updates.link = body.link;

        const channel = await this.channelRepo.update(channelOid, updates);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_updated',
            payload: { serverId, channel, senderId: userId },
        });

        const changes = [];
        if (body.name && body.name !== existingChannel.name) {
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
            const newCatString = body.categoryId ? body.categoryId : null;
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

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'edit_channel',
                targetId: channelOid,
                targetType: 'channel',
                changes,
                metadata: { channelName: existingChannel.name },
            });
        }

        return channel;
    }

    @Delete('channels/:channelId')
    @ApiOperation({ summary: 'Delete channel' })
    @ApiResponse({ status: 200, description: 'Channel deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async deleteChannel(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelOid);
        const server = await this.serverRepo.findById(serverOid);

        if (channel && server) {
            await this.exportService.handleChannelDeletion(
                channelOid,
                channel.name,
                server.name,
            );
        }

        await this.channelRepo.delete(channelOid);

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'channel_deleted',
            payload: { serverId, channelId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'delete_channel',
            targetId: channelOid,
            targetType: 'channel',
            metadata: { channelName: channel?.name },
        });

        return { message: 'Channel deleted' };
    }

    @Post('categories')
    @ApiOperation({ summary: 'Create category' })
    @ApiResponse({ status: 201, type: CategoryResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createCategory(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: CreateCategoryRequestDTO,
    ): Promise<ICategory> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const maxPositionCategory =
            await this.categoryRepo.findMaxPositionByServerId(serverOid);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionCategory
                  ? maxPositionCategory.position + 1
                  : 0;

        const category = await this.categoryRepo.create({
            serverId: serverOid,
            name: body.name,
            position: finalPosition,
        });

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_created',
            payload: { serverId, category, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'create_category',
            targetId: category._id as Types.ObjectId,
            targetType: 'category',
            metadata: {
                categoryName: category.name,
                targetName: category.name,
            },
        });

        return category;
    }

    @Patch('categories/reorder')
    @ApiOperation({ summary: 'Reorder categories' })
    @ApiResponse({ status: 200, description: 'Categories reordered' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async reorderCategories(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: ReorderCategoriesRequestDTO,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        for (const { categoryId, position } of body.categoryPositions) {
            await this.categoryRepo.update(new Types.ObjectId(categoryId), {
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
        @Req() req: Request,
        @Body() body: UpdateCategoryRequestDTO,
    ): Promise<ICategory> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const categoryOid = new Types.ObjectId(categoryId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const updates: Partial<ICategory> = {};
        if (body.name) updates.name = body.name;
        if (body.position !== undefined) updates.position = body.position;

        const existingCategory = await this.categoryRepo.findById(categoryOid);
        if (!existingCategory) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const category = await this.categoryRepo.update(categoryOid, updates);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_updated',
            payload: { serverId, category, senderId: userId },
        });

        const changes = [];
        if (body.name && body.name !== existingCategory.name) {
            changes.push({
                field: 'name',
                before: existingCategory.name,
                after: body.name,
            });
        }
        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'edit_category',
                targetId: categoryOid,
                targetType: 'category',
                changes,
                metadata: {
                    categoryName: existingCategory.name,
                    targetName: existingCategory.name,
                },
            });
        }

        return category;
    }

    @Delete('categories/:categoryId')
    @ApiOperation({ summary: 'Delete category' })
    @ApiResponse({ status: 200, description: 'Category deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async deleteCategory(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const categoryOid = new Types.ObjectId(categoryId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryOid);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        await this.categoryRepo.delete(categoryOid);

        // Orphan channels by moving them out of the deleted category
        const channels = await this.channelRepo.findByServerId(serverOid);
        for (const channel of channels) {
            if (channel.categoryId?.toString() === categoryId) {
                await this.channelRepo.update(channel._id, {
                    categoryId: null,
                });
            }
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'category_deleted',
            payload: { serverId, categoryId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'delete_category',
            targetId: categoryOid,
            targetType: 'category',
            metadata: {
                categoryName: category.name,
                targetName: category.name,
            },
        });

        return { message: 'Category deleted' };
    }

    @Get('channels/:channelId/permissions')
    @ApiOperation({ summary: 'Get channel permissions' })
    @ApiResponse({ status: 200, description: 'Permissions retrieved' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async getChannelPermissions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelOid);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverOid,
            channel.permissions as Record<string, Record<string, boolean>>,
        );

        return { permissions: normalized };
    }

    @Patch('channels/:channelId/permissions')
    @ApiOperation({ summary: 'Update channel permissions' })
    @ApiResponse({ status: 200, description: 'Permissions updated' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async updateChannelPermissions(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
        @Body() body: UpdatePermissionsRequestDTO,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const channelOid = new Types.ObjectId(channelId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelOid);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        const changes = [];

        if (body.permissions) {
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
        }

        const oldPerms =
            (channel.permissions as Record<string, Record<string, boolean>>) ||
            {};
        const roles = await this.roleRepo.findByServerId(serverOid);
        const roleMap = new Map(roles.map((r) => [r._id.toString(), r]));

        const allRoleIds = new Set([
            ...Object.keys(oldPerms),
            ...Object.keys(filteredPermissions),
        ]);

        for (const id of allRoleIds) {
            const roleName =
                id === 'everyone'
                    ? '@everyone'
                    : roleMap.get(id)?.name || `Role ${id}`;
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
            serverOid,
            filteredPermissions,
        );

        await this.channelRepo.update(channelOid, {
            permissions: normalized,
        });

        this.permissionService.invalidateCache(serverOid);

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
            serverId: serverOid,
            actorId: userOid,
            actionType: 'channel_permissions_updated',
            targetId: channelOid,
            targetType: 'channel',
            metadata: { channelName: channel.name },
            ...(changes.length > 0 && { changes }),
        });

        return { permissions: normalized };
    }

    @Get('categories/:categoryId/permissions')
    @ApiOperation({ summary: 'Get category permissions' })
    @ApiResponse({ status: 200, description: 'Permissions retrieved' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async getCategoryPermissions(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @Req() req: Request,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const categoryOid = new Types.ObjectId(categoryId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryOid);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const normalized = await this.permissionService.normalizePermissionMap(
            serverOid,
            category.permissions as Record<string, Record<string, boolean>>,
        );

        return { permissions: normalized };
    }

    @Patch('categories/:categoryId/permissions')
    @ApiOperation({ summary: 'Update category permissions' })
    @ApiResponse({ status: 200, description: 'Permissions updated' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async updateCategoryPermissions(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @Req() req: Request,
        @Body() body: UpdatePermissionsRequestDTO,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const categoryOid = new Types.ObjectId(categoryId);
        const userOid = new Types.ObjectId(userId);

        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryOid);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const filteredPermissions: Record<string, Record<string, boolean>> = {};
        const changes = [];

        if (body.permissions) {
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
        }

        const oldPerms =
            (category.permissions as Record<string, Record<string, boolean>>) ||
            {};
        const roles = await this.roleRepo.findByServerId(serverOid);
        const roleMap = new Map(roles.map((r) => [r._id.toString(), r]));

        const allRoleIds = new Set([
            ...Object.keys(oldPerms),
            ...Object.keys(filteredPermissions),
        ]);

        for (const id of allRoleIds) {
            const roleName =
                id === 'everyone'
                    ? '@everyone'
                    : roleMap.get(id)?.name || `Role ${id}`;
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
            serverOid,
            filteredPermissions,
        );

        await this.categoryRepo.update(categoryOid, {
            permissions: normalized,
        });

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'category_permissions_updated',
            payload: {
                serverId,
                categoryId,
                permissions: normalized,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'category_permissions_updated',
            targetId: categoryOid,
            targetType: 'category',
            metadata: { categoryName: category.name },
            ...(changes.length > 0 && { changes }),
        });

        return { permissions: normalized };
    }
}
