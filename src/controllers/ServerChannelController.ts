import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
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
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

interface CreateChannelRequest {
    name: string;
    type?: 'text' | 'voice';
    position?: number;
    categoryId?: string;
    description?: string;
}

interface UpdateChannelRequest {
    name?: string;
    position?: number;
    categoryId?: string | null;
    description?: string;
}

interface ReorderChannelsRequest {
    channelPositions: { channelId: string; position: number }[];
}

interface CreateCategoryRequest {
    name: string;
    position?: number;
}

interface UpdateCategoryRequest {
    name?: string;
    position?: number;
}

interface ReorderCategoriesRequest {
    categoryPositions: { categoryId: string; position: number }[];
}

interface UpdatePermissionsRequest {
    permissions: { [roleId: string]: any };
}

// Controller for managing server channels and categories
// Enforcing server membership and 'manageChannels' permission checks
@injectable()
@Route('api/v1/servers/{serverId}')
@Tags('Server Channels')
@Security('jwt')
export class ServerChannelController extends Controller {
    constructor(
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.CategoryRepository)
        private categoryRepo: ICategoryRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    // Retrieves all channels for a server, including unread status for the requester
    @Get('channels')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async getChannels(
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

        return channels.map((channel: any) => {
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
            };
        });
    }

    // Retrieves all categories for a server
    @Get('categories')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async getCategories(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<ICategory[]> {
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

        return await this.categoryRepo.findByServerId(serverId);
    }

    // Creates a new channel in a server
    // Enforces 'manageChannels' permission
    @Post('channels')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    public async createChannel(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: CreateChannelRequest,
    ): Promise<IChannel> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        // Default to the end of the list if no position is specified
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

    // Reorders channels within a server
    // Enforces 'manageChannels' permission
    @Patch('channels/reorder')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    public async reorderChannels(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: ReorderChannelsRequest,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
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

    // Retrieves statistics for a specific channel
    @Get('channels/{channelId}/stats')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.CHANNEL.NOT_IN_SERVER,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async getChannelStats(
        @Path() serverId: string,
        @Path() channelId: string,
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

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        if (channel.serverId.toString() !== serverId) {
            this.setStatus(400);
            throw new Error(ErrorMessages.CHANNEL.NOT_IN_SERVER);
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

    // Updates channel settings
    // Enforces 'manageChannels' permission
    @Patch('channels/{channelId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async updateChannel(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
        @Body() body: UpdateChannelRequest,
    ): Promise<IChannel> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const updates: any = {};
        if (body.name) updates.name = body.name.trim();
        if (body.position !== undefined) updates.position = body.position;
        if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
        if (body.description !== undefined)
            updates.description = body.description;

        const channel = await this.channelRepo.update(channelId, updates);
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_updated', {
            serverId,
            channel,
        });

        return channel;
    }

    // Deletes a channel from a server
    // Enforces 'manageChannels' permission
    @Delete('channels/{channelId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async deleteChannel(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        await this.channelRepo.delete(channelId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('channel_deleted', {
            serverId,
            channelId,
        });

        return { message: 'Channel deleted' };
    }

    // Creates a new category in a server
    // Enforces 'manageChannels' permission
    @Post('categories')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    public async createCategory(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: CreateCategoryRequest,
    ): Promise<ICategory> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
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

    // Updates category settings
    // Enforces 'manageChannels' permission
    @Patch('categories/{categoryId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Category Not Found', {
        error: ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND,
    })
    public async updateCategory(
        @Path() serverId: string,
        @Path() categoryId: string,
        @Request() req: express.Request,
        @Body() body: UpdateCategoryRequest,
    ): Promise<ICategory> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const updates: any = {};
        if (body.name) updates.name = body.name.trim();
        if (body.position !== undefined) updates.position = body.position;

        const category = await this.categoryRepo.update(categoryId, updates);
        if (!category) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('category_updated', {
            serverId,
            category,
        });

        return category;
    }

    // Deletes a category from a server
    // Enforces 'manageChannels' permission
    @Delete('categories/{categoryId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Category Not Found', {
        error: ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND,
    })
    public async deleteCategory(
        @Path() serverId: string,
        @Path() categoryId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
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

    // Reorders categories within a server
    // Enforces 'manageChannels' permission
    @Patch('categories/reorder')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    public async reorderCategories(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: ReorderCategoriesRequest,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
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

    // Retrieves permission overrides for a specific channel
    // Enforces 'manageChannels' permission
    @Get('channels/{channelId}/permissions')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async getChannelPermissions(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
    ): Promise<{ permissions: { [roleId: string]: any } }> {
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

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
        }

        return { permissions: channel.permissions || {} };
    }

    // Updates permission overrides for a specific channel
    // Enforces 'manageChannels' permission
    @Patch('channels/{channelId}/permissions')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Channel Not Found', {
        error: ErrorMessages.CHANNEL.NOT_FOUND,
    })
    public async updateChannelPermissions(
        @Path() serverId: string,
        @Path() channelId: string,
        @Request() req: express.Request,
        @Body() body: UpdatePermissionsRequest,
    ): Promise<{ permissions: { [roleId: string]: any } }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const channel = await this.channelRepo.findById(channelId);
        if (!channel) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.NOT_FOUND);
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

    // Retrieves permission overrides for a specific category
    // Enforces 'manageChannels' permission
    @Get('categories/{categoryId}/permissions')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Category Not Found', {
        error: ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND,
    })
    public async getCategoryPermissions(
        @Path() serverId: string,
        @Path() categoryId: string,
        @Request() req: express.Request,
    ): Promise<{ permissions: { [roleId: string]: any } }> {
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

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryId);
        if (!category) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
        }

        return { permissions: category.permissions || {} };
    }

    // Updates permission overrides for a specific category
    // Enforces 'manageChannels' permission
    @Patch('categories/{categoryId}/permissions')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Category Not Found', {
        error: ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND,
    })
    public async updateCategoryPermissions(
        @Path() serverId: string,
        @Path() categoryId: string,
        @Request() req: express.Request,
        @Body() body: UpdatePermissionsRequest,
    ): Promise<{ permissions: { [roleId: string]: any } }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageChannels',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.CHANNEL.NO_PERMISSION_MANAGE);
        }

        const category = await this.categoryRepo.findById(categoryId);
        if (!category) {
            this.setStatus(404);
            throw new Error(ErrorMessages.CHANNEL.CATEGORY_NOT_FOUND);
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
