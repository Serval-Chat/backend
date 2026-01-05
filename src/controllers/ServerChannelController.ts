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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type {
    IChannelRepository,
    IChannel,
} from '@/di/interfaces/IChannelRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import type {
    ICategoryRepository,
    ICategory,
} from '@/di/interfaces/ICategoryRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import { PermissionService } from '@/services/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { ErrorMessages } from '@/constants/errorMessages';
import {
    CreateChannelRequest,
    UpdateChannelRequest,
    ReorderChannelsRequest,
    CreateCategoryRequest,
    UpdateCategoryRequest,
    ReorderCategoriesRequest,
    UpdatePermissionsRequest,
    ChannelWithReadResponse,
    ChannelStatsResponse,
    ChannelResponse,
    CategoryResponse,
} from './dto/server-channel.dto';

@injectable()
@Controller('api/v1/servers/:serverId')
@ApiTags('Server Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerChannelController {
    constructor(
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ServerChannelReadRepository)
        @Inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.CategoryRepository)
        @Inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) { }

    @Get('channels')
    @ApiOperation({ summary: 'Get server channels' })
    @ApiResponse({ status: 200, type: [ChannelWithReadResponse] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getChannels(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<ChannelWithReadResponse[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channels = await this.channelRepo.findByServerId(serverId);
        const reads = await this.serverChannelReadRepo.findByServerAndUser(
            serverId,
            userId,
        );
        const readMap = new Map<string, Date>();
        reads.forEach((read) => {
            if (read.channelId) {
                readMap.set(read.channelId, read.lastReadAt);
            }
        });

        return channels.map((channel: IChannel) => {
            const channelId = channel._id?.toString();
            const lastMessageAt: Date | null = channel.lastMessageAt ?? null;
            const lastReadAt: Date | undefined = channelId
                ? readMap.get(channelId)
                : undefined;

            return {
                ...channel,
                lastMessageAt: lastMessageAt
                    ? lastMessageAt.toISOString()
                    : null,
                lastReadAt: lastReadAt ? lastReadAt.toISOString() : null,
            } as ChannelWithReadResponse;
        });
    }

    @Get('categories')
    @ApiOperation({ summary: 'Get server categories' })
    @ApiResponse({ status: 200, type: [CategoryResponse] })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getCategories(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<ICategory[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.categoryRepo.findByServerId(serverId);
    }

    @Post('channels')
    @ApiOperation({ summary: 'Create channel' })
    @ApiResponse({ status: 201, type: ChannelResponse })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createChannel(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: CreateChannelRequest,
    ): Promise<IChannel> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const maxPositionChannel =
            await this.channelRepo.findMaxPositionByServerId(serverId);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionChannel
                    ? maxPositionChannel.position + 1
                    : 0;

        const channel = await this.channelRepo.create({
            serverId,
            name: body.name.trim(),
            type: body.type || 'text',
            position: finalPosition,
            categoryId: body.categoryId || null,
            permissions: {
                everyone: { sendMessages: true },
            },
            ...(body.description && { description: body.description }),
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_created', {
            serverId,
            channel,
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
        @Body() body: ReorderChannelsRequest,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        for (const { channelId, position } of body.channelPositions) {
            await this.channelRepo.update(channelId, { position });
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('channels_reordered', {
            serverId,
            channelPositions: body.channelPositions,
        });

        return { message: 'Channels reordered' };
    }

    @Get('channels/:channelId/stats')
    @ApiOperation({ summary: 'Get channel stats' })
    @ApiResponse({ status: 200, type: ChannelStatsResponse })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async getChannelStats(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
    ): Promise<ChannelStatsResponse> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        if (channel.serverId.toString() !== serverId) {
            throw new ApiError(400, ErrorMessages.CHANNEL.NOT_IN_SERVER);
        }

        const messageCount =
            await this.serverMessageRepo.countByChannelId(channelId);

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
    @ApiResponse({ status: 200, type: ChannelResponse })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Channel Not Found' })
    public async updateChannel(
        @Param('serverId') serverId: string,
        @Param('channelId') channelId: string,
        @Req() req: Request,
        @Body() body: UpdateChannelRequest,
    ): Promise<IChannel> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const updates: Partial<IChannel> = {};
        if (body.name) updates.name = body.name.trim();
        if (body.position !== undefined) updates.position = body.position;
        if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
        if (body.description !== undefined)
            updates.description = body.description;

        const channel = await this.channelRepo.update(channelId, updates);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_updated', {
            serverId,
            channel,
        });

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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        await this.channelRepo.delete(channelId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_deleted', {
            serverId,
            channelId,
        });

        return { message: 'Channel deleted' };
    }

    @Post('categories')
    @ApiOperation({ summary: 'Create category' })
    @ApiResponse({ status: 201, type: CategoryResponse })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async createCategory(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: CreateCategoryRequest,
    ): Promise<ICategory> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const maxPositionCategory =
            await this.categoryRepo.findMaxPositionByServerId(serverId);
        const finalPosition =
            body.position !== undefined
                ? body.position
                : maxPositionCategory
                    ? maxPositionCategory.position + 1
                    : 0;

        const category = await this.categoryRepo.create({
            serverId,
            name: body.name.trim(),
            position: finalPosition,
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('category_created', {
            serverId,
            category,
        });

        return category;
    }

    @Patch('categories/:categoryId')
    @ApiOperation({ summary: 'Update category' })
    @ApiResponse({ status: 200, type: CategoryResponse })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Category Not Found' })
    public async updateCategory(
        @Param('serverId') serverId: string,
        @Param('categoryId') categoryId: string,
        @Req() req: Request,
        @Body() body: UpdateCategoryRequest,
    ): Promise<ICategory> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const updates: Partial<ICategory> = {};
        if (body.name) updates.name = body.name.trim();
        if (body.position !== undefined) updates.position = body.position;

        const category = await this.categoryRepo.update(categoryId, updates);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('category_updated', {
            serverId,
            category,
        });

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
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        await this.categoryRepo.delete(categoryId);

        // Orphan channels by moving them out of the deleted category
        const channels = await this.channelRepo.findByServerId(serverId);
        for (const channel of channels) {
            if (channel.categoryId?.toString() === categoryId) {
                await this.channelRepo.update(channel._id.toString(), {
                    categoryId: null,
                });
            }
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('category_deleted', {
            serverId,
            categoryId,
        });

        return { message: 'Category deleted' };
    }

    @Patch('categories/reorder')
    @ApiOperation({ summary: 'Reorder categories' })
    @ApiResponse({ status: 200, description: 'Categories reordered' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async reorderCategories(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: ReorderCategoriesRequest,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        for (const { categoryId, position } of body.categoryPositions) {
            await this.categoryRepo.update(categoryId, { position });
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('categories_reordered', {
            serverId,
            categoryPositions: body.categoryPositions,
        });

        return { message: 'Categories reordered' };
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
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        return { permissions: channel.permissions || {} };
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
        @Body() body: UpdatePermissionsRequest,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            throw new ApiError(404, ErrorMessages.CHANNEL.NOT_FOUND);
        }

        await this.channelRepo.update(channelId, {
            permissions: body.permissions || {},
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_permissions_updated', {
            serverId,
            channelId,
            permissions: body.permissions || {},
        });

        return { permissions: body.permissions || {} };
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
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryId);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        return { permissions: category.permissions || {} };
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
        @Body() body: UpdatePermissionsRequest,
    ): Promise<{ permissions: Record<string, Record<string, boolean>> }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryId);
        if (!category) {
            throw new ApiError(404, ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        await this.categoryRepo.update(categoryId, {
            permissions: body.permissions || {},
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('category_permissions_updated', {
            serverId,
            categoryId,
            permissions: body.permissions || {},
        });

        return { permissions: body.permissions || {} };
    }
}
