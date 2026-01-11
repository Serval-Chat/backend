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
    UseInterceptors,
    UploadedFile,
    Inject,
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
import type {
    IServerRepository,
    IServer,
} from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IInviteRepository } from '@/di/interfaces/IInviteRepository';
import type { IServerMessageRepository } from '@/di/interfaces/IServerMessageRepository';
import type { IServerBanRepository } from '@/di/interfaces/IServerBanRepository';
import type { IServerChannelReadRepository } from '@/di/interfaces/IServerChannelReadRepository';
import { PermissionService } from '@/services/PermissionService';
import { ILogger } from '@/di/interfaces/ILogger';
import { WsServer } from '@/ws/server';
import { ErrorMessages } from '@/constants/errorMessages';
import { Request } from 'express';
import { JWTPayload } from '@/utils/jwt';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { IChannel } from '@/di/interfaces/IChannelRepository';
import { storage } from '@/config/multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';
import {
    CreateServerRequestDTO,
    UpdateServerRequestDTO,
    SetDefaultRoleRequestDTO,
} from './dto/server.request.dto';
import {
    ServerStatsResponseDTO,
    ServerResponseDTO,
    SetDefaultRoleResponseDTO,
    UploadIconResponseDTO,
    UploadBannerResponseDTO,
} from './dto/server.response.dto';
import { UpdateDefaultRoleRequestDTO } from './dto/server-default-role.request.dto';

@injectable()
@Controller('api/v1/servers')
@ApiTags('Servers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'servers',
    );

    constructor(
        @inject(TYPES.ServerRepository)
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.RoleRepository)
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.InviteRepository)
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @inject(TYPES.ServerMessageRepository)
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerBanRepository)
        @Inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @inject(TYPES.ServerChannelReadRepository)
        @Inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
    ) {
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    @Get()
    @ApiOperation({ summary: 'Get user servers' })
    @ApiResponse({ status: 200, type: [ServerResponseDTO] })
    public async getServers(@Req() req: Request): Promise<IServer[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const memberships = await this.serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId.toString());
        const servers = await this.serverRepo.findByIds(serverIds);

        return await Promise.all(
            servers.map(async (server) => {
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id.toString(),
                );
                return {
                    ...server,
                    memberCount,
                };
            }),
        );
    }

    @Post()
    @ApiOperation({ summary: 'Create server' })
    @ApiResponse({ status: 201, description: 'Server created' })
    @ApiResponse({ status: 400, description: 'Invalid name' })
    public async createServer(
        @Req() req: Request,
        @Body() body: CreateServerRequestDTO,
    ): Promise<{ server: IServer; channel: IChannel }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const { name } = body;

        const server = await this.serverRepo.create({
            name: name.trim(),
            ownerId: userId,
        });

        // Initialize default '@everyone' role with default permissions
        await this.roleRepo.create({
            serverId: server._id.toString(),
            name: '@everyone',
            color: '#99aab5',
            position: 0,
            permissions: {
                sendMessages: true,
                manageMessages: false,
                manageChannels: false,
                manageRoles: false,
                banMembers: false,
                kickMembers: false,
                manageInvites: false,
                manageServer: false,
                administrator: false,
                pingRolesAndEveryone: false,
            },
        });

        // Create initial '#general' text channel
        const channel = await this.channelRepo.create({
            serverId: server._id.toString(),
            name: 'general',
            type: 'text',
            position: 0,
        });

        // Automatically add the creator as the first member
        await this.serverMemberRepo.create({
            serverId: server._id.toString(),
            userId: userId,
            roles: [],
        });

        return { server, channel };
    }

    @Get('unread')
    @ApiOperation({ summary: 'Get unread status' })
    @ApiResponse({ status: 200, description: 'Unread status per server' })
    public async getUnreadStatus(
        @Req() req: Request,
    ): Promise<Record<string, boolean>> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const memberships = await this.serverMemberRepo.findByUserId(userId);
        const serverIds = memberships.map((m) => m.serverId.toString());

        if (serverIds.length === 0) return {};

        const channels = await this.channelRepo.findByServerIds(serverIds);
        const reads = await this.serverChannelReadRepo.findByUserId(userId);

        const readMap = new Map<string, Date>();
        reads.forEach((read) => readMap.set(read.channelId, read.lastReadAt));

        const unreadMap: Record<string, boolean> = {};
        serverIds.forEach((id) => (unreadMap[id] = false));

        // A server is unread if any of its channels have a message newer than the user's last read timestamp
        for (const channel of channels) {
            const serverId = channel.serverId.toString();
            if (unreadMap[serverId]) continue;

            const lastMessageAt = channel.lastMessageAt;
            if (!lastMessageAt) continue;

            const lastReadAt = readMap.get(channel._id.toString());
            if (!lastReadAt || new Date(lastMessageAt) > new Date(lastReadAt)) {
                unreadMap[serverId] = true;
            }
        }

        return unreadMap;
    }

    @Post(':serverId/ack')
    @ApiOperation({ summary: 'Mark server as read' })
    @ApiResponse({ status: 201, description: 'Server marked as read' })
    @ApiResponse({ status: 400, description: 'Invalid ID' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async markServerAsRead(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channels = await this.channelRepo.findByServerId(serverId);
        if (channels.length > 0) {
            const ServerChannelReadModel = mongoose.model('ServerChannelRead');
            // Bulk update read timestamps for all channels in the server
            const operations = channels.map((channel) => ({
                updateOne: {
                    filter: { serverId, channelId: channel._id, userId },
                    update: { $set: { lastReadAt: new Date() } },
                    upsert: true,
                },
            }));
            await ServerChannelReadModel.bulkWrite(operations);
        }

        return { message: 'Server marked as read' };
    }

    @Get(':serverId')
    @ApiOperation({ summary: 'Get server details' })
    @ApiResponse({ status: 200, type: ServerResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server Not Found' })
    public async getServerDetails(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<IServer> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount =
            await this.serverMemberRepo.countByServerId(serverId);

        return {
            ...server,
            memberCount,
        };
    }

    @Get(':serverId/stats')
    @ApiOperation({ summary: 'Get server stats' })
    @ApiResponse({ status: 200, type: ServerStatsResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server Not Found' })
    public async getServerStats(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<ServerStatsResponseDTO> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        const members = await this.serverMemberRepo.findByServerId(serverId);
        const totalCount = members.length;

        const userIds = members.map((m) => m.userId.toString());
        const users = await this.userRepo.findByIds(userIds);
        const userMap = new Map(users.map((u) => [u._id.toString(), u]));

        // Calculate online count by checking presence for each member
        let onlineCount = 0;
        for (const m of members) {
            const userIdStr = m.userId.toString();
            if (this.wsServer.isUserOnline(userIdStr)) {
                onlineCount++;
            }
        }

        const bannedUsers = await this.serverBanRepo.findByServerId(serverId);
        const bannedUserCount = bannedUsers.length;

        const owner = await this.userRepo.findById(server.ownerId.toString());
        const ownerName = owner?.displayName || owner?.username || 'Unknown';

        // Identify the most recent member by join date
        const sortedMembers = [...members].sort((a, b) => {
            const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return dateB - dateA;
        });
        const newestMemberId = sortedMembers[0]?.userId.toString();
        const newestMemberUser = newestMemberId
            ? userMap.get(newestMemberId)
            : null;
        const newestMember =
            newestMemberUser?.displayName ||
            newestMemberUser?.username ||
            'Unknown';

        const channels = await this.channelRepo.findByServerId(serverId);
        const channelCount = channels.length;

        const EmojiModel = mongoose.model('Emoji');
        const emojiCount = await EmojiModel.countDocuments({ serverId }).exec();

        // Update all-time high if current online count exceeds previous record
        let allTimeHigh = server.allTimeHigh || 0;
        if (onlineCount > allTimeHigh) {
            allTimeHigh = onlineCount;
            await this.serverRepo.update(serverId, { allTimeHigh });
        }

        return {
            onlineCount,
            totalCount,
            bannedUserCount,
            serverId: server._id.toString(),
            serverName: server.name,
            ownerName,
            createdAt: server.createdAt
                ? server.createdAt.toISOString()
                : new Date().toISOString(),
            allTimeHigh,
            newestMember,
            channelCount,
            emojiCount,
        };
    }

    @Patch(':serverId')
    @ApiOperation({ summary: 'Update server' })
    @ApiResponse({ status: 200, type: ServerResponseDTO })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server Not Found' })
    public async updateServer(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: UpdateServerRequestDTO,
    ): Promise<IServer> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        const updates: Record<string, unknown> = {};
        if (body.name) updates.name = body.name;
        if (body.banner) updates.banner = body.banner;
        if (body.disableCustomFonts !== undefined)
            updates.disableCustomFonts = body.disableCustomFonts;

        const server = await this.serverRepo.update(serverId, updates);
        if (!server) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_updated',
            payload: {
                serverId,
                server,
            },
        });

        return server;
    }

    @Post(':serverId/roles/default')
    @ApiOperation({ summary: 'Set default role' })
    @ApiResponse({ status: 201, type: SetDefaultRoleResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server or role not found' })
    public async setDefaultRole(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: SetDefaultRoleRequestDTO,
    ): Promise<{ defaultRoleId: string | null }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const { roleId } = body;

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (roleId) {
            const role = await this.roleRepo.findById(roleId);
            if (!role) {
                throw new ApiError(404, ErrorMessages.ROLE.NOT_FOUND);
            }
            if (role.serverId.toString() !== serverId) {
                throw new ApiError(400, ErrorMessages.ROLE.NOT_IN_SERVER);
            }
            if (role.name && role.name.trim().toLowerCase() === '@everyone') {
                throw new ApiError(
                    400,
                    ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
                );
            }
        }

        const server = await this.serverRepo.update(serverId, {
            defaultRoleId: roleId || undefined,
        });

        if (server) {
            this.wsServer.broadcastToServer(serverId, {
                type: 'server_updated',
                payload: {
                    serverId,
                    server,
                },
            });
        }

        return { defaultRoleId: roleId || null };
    }

    @Delete(':serverId')
    @ApiOperation({ summary: 'Delete server' })
    @ApiResponse({ status: 200, description: 'Server deleted' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server Not Found' })
    public async deleteServer(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.ownerId.toString() !== userId) {
            throw new ApiError(403, ErrorMessages.SERVER.ONLY_OWNER_DELETE);
        }

        await this.serverRepo.delete(serverId);
        await this.channelRepo.deleteByServerId(serverId);
        await this.serverMemberRepo.deleteByServerId(serverId);
        await this.roleRepo.deleteByServerId(serverId);
        await this.inviteRepo.deleteByServerId(serverId);
        await this.serverMessageRepo.deleteByServerId(serverId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_deleted',
            payload: { serverId },
        });

        return { message: 'Server deleted' };
    }

    @Post(':serverId/icon')
    @ApiOperation({ summary: 'Upload server icon' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                icon: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('icon', { storage }))
    @ApiResponse({ status: 201, type: UploadIconResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async uploadServerIcon(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @UploadedFile() icon: Express.Multer.File,
    ): Promise<{ icon: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (!icon) {
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const filename = `${serverId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = icon.path || icon.buffer;
        if (!input) {
            throw new ApiError(500, ErrorMessages.FILE.DATA_MISSING);
        }

        // Normalize server icons to 256x256 PNG
        await sharp(input)
            .resize(256, 256, { fit: 'cover' })
            .png()
            .toFile(filepath);

        // Cleanup temporary Multer file if it was written to disk
        if (icon.path && fs.existsSync(icon.path)) {
            fs.unlinkSync(icon.path);
        }

        const iconUrl = `/api/v1/servers/icon/${filename}`;
        const updatedServer = await this.serverRepo.update(serverId, {
            icon: iconUrl,
        });
        if (!updatedServer) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_icon_updated',
            payload: {
                serverId,
                icon: iconUrl,
            },
        });

        return { icon: iconUrl };
    }

    @Post(':serverId/banner')
    @ApiOperation({ summary: 'Upload server banner' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                banner: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('banner', { storage }))
    @ApiResponse({ status: 201, type: UploadBannerResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async uploadServerBanner(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @UploadedFile() banner: Express.Multer.File,
    ): Promise<{ banner: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (!banner) {
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const ext = banner.mimetype === 'image/gif' ? 'gif' : 'png';
        const filename = `${serverId}-banner-${Date.now()}.${ext}`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = banner.path || banner.buffer;
        if (!input) {
            throw new ApiError(500, ErrorMessages.FILE.DATA_MISSING);
        }

        // Normalize server banners to 960x540; preserve animation for GIFs
        if (ext === 'gif') {
            await sharp(input, { animated: true })
                .resize(960, 540, { fit: 'cover' })
                .gif()
                .toFile(filepath);
        } else {
            await sharp(input)
                .resize(960, 540, { fit: 'cover' })
                .png()
                .toFile(filepath);
        }

        // Cleanup temporary Multer file if it was written to disk
        if (banner.path && fs.existsSync(banner.path)) {
            fs.unlinkSync(banner.path);
        }

        const bannerUrl = `/api/v1/servers/banner/${filename}`;
        const updatedServer = await this.serverRepo.update(serverId, {
            banner: { type: 'image', value: bannerUrl },
        });
        if (!updatedServer) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_banner_updated',
            payload: {
                serverId,
                banner: { type: 'image', value: bannerUrl },
            },
        });

        return { banner: bannerUrl };
    }
    @Patch(':serverId/default-role')
    @ApiOperation({ summary: 'Update server default role' })
    @ApiResponse({ status: 200, type: SetDefaultRoleResponseDTO })
    @ApiResponse({ status: 400, description: 'Bad Request' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server or role not found' })
    public async updateDefaultRole(
        @Param('serverId') serverId: string,
        @Req() req: Request,
        @Body() body: UpdateDefaultRoleRequestDTO,
    ): Promise<{ defaultRoleId: string | null }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const { roleId } = body;

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (roleId) {
            const role = await this.roleRepo.findById(roleId);
            if (!role) {
                throw new ApiError(404, ErrorMessages.ROLE.NOT_FOUND);
            }
            if (role.serverId.toString() !== serverId) {
                throw new ApiError(400, ErrorMessages.ROLE.NOT_IN_SERVER);
            }
            if (role.name && role.name.trim().toLowerCase() === '@everyone') {
                throw new ApiError(
                    400,
                    ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
                );
            }
        }

        const server = await this.serverRepo.update(serverId, {
            defaultRoleId: roleId || undefined,
        });

        if (server) {
            this.wsServer.broadcastToServer(serverId, {
                type: 'server_updated',
                payload: {
                    serverId,
                    server,
                },
            });
        }

        return { defaultRoleId: roleId || null };
    }
}
