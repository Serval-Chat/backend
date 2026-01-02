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
    UploadedFile,
} from 'tsoa';
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
import type { ILogger } from '@/di/interfaces/ILogger';
import { container } from '@/di/container';
import { getIO } from '@/socket';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';
import express from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import mongoose from 'mongoose';

interface CreateServerRequest {
    // Name of the server
    name: string;
}

interface UpdateServerRequest {
    // New name for the server
    name?: string;
    // Server banner configuration
    banner?: {
        // Type of banner (e.g., 'image')
        type: string;
        // Value of the banner (e.g., URL)
        value: string;
    };
    // Whether to disable custom fonts on the server
    disableCustomFonts?: boolean;
}

interface SetDefaultRoleRequest {
    // ID of the role to set as default, or null to remove default role
    roleId: string | null;
}

// Controller for server management, membership, and statistics
// Enforces ownership checks, permission validation, and path sanitization for uploads
@injectable()
@Route('api/v1/servers')
@Tags('Servers')
@Security('jwt')
export class ServerController extends Controller {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'servers',
    );

    constructor(
        @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.InviteRepository) private inviteRepo: IInviteRepository,
        @inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    // Retrieves all servers where the current user is a member
    @Get()
    public async getServers(
        @Request() req: express.Request,
    ): Promise<IServer[]> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
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

    // Creates a new server and initializes default roles and channels
    @Post()
    public async createServer(
        @Request() req: express.Request,
        @Body() body: CreateServerRequest,
    ): Promise<{ server: IServer; channel: any }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { name } = body;

        if (!name || name.trim().length === 0) {
            this.setStatus(400);
            throw new Error(ErrorMessages.SERVER.NAME_REQUIRED);
        }

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

    // Retrieves unread status for all servers the user is a member of
    @Get('unread')
    public async getUnreadStatus(
        @Request() req: express.Request,
    ): Promise<Record<string, boolean>> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
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

    // Marks all channels in a server as read for the current user
    @Post('{serverId}/ack')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('400', 'Invalid input', {
        error: ErrorMessages.SERVER.INVALID_ID,
    })
    public async markServerAsRead(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
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

    // Retrieves detailed information about a server
    // Enforces server membership
    @Get('{serverId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Server Not Found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    public async getServerDetails(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<IServer> {
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

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount = await this.serverMemberRepo.countByServerId(serverId);

        return {
            ...server,
            memberCount,
        };
    }

    // Retrieves aggregated statistics for a server
    // Includes member counts, online status, and all-time high tracking
    @Get('{serverId}/stats')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    @Response<ErrorResponse>('404', 'Server not found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    public async getServerStats(
        @Path() serverId: string,
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

        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
        }

        const members = await this.serverMemberRepo.findByServerId(serverId);
        const totalCount = members.length;

        const userIds = members.map((m) => m.userId.toString());
        const users = await this.userRepo.findByIds(userIds);
        const userMap = new Map(users.map((u) => [u._id.toString(), u]));

        const presenceService = container.get<any>(TYPES.PresenceService);
        const onlineUsernames = new Set(presenceService.getAllOnlineUsers());

        // Calculate online count by checking presence for each member
        let onlineCount = 0;
        for (const m of members) {
            const user = userMap.get(m.userId.toString());
            if (user?.username && onlineUsernames.has(user.username)) {
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
            createdAt: (server as any).createdAt
                ? (server as any).createdAt.toISOString()
                : new Date().toISOString(),
            allTimeHigh,
            newestMember,
            channelCount,
            emojiCount,
        };
    }

    // Updates server settings
    // Enforces 'manageServer' permission
    @Patch('{serverId}')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Server not found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    public async updateServer(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: UpdateServerRequest,
    ): Promise<IServer> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        const updates: any = {};
        if (body.name) updates.name = body.name;
        if (body.banner) updates.banner = body.banner;
        if (body.disableCustomFonts !== undefined)
            updates.disableCustomFonts = body.disableCustomFonts;

        const server = await this.serverRepo.update(serverId, updates);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_updated', {
            serverId,
            server,
        });

        return server;
    }

    // Sets the default role for new members in the server
    // Enforces 'manageServer' permission
    @Post('{serverId}/roles/default')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('404', 'Server or role not found', {
        error: ErrorMessages.ROLE.NOT_FOUND,
    })
    public async setDefaultRole(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: SetDefaultRoleRequest,
    ): Promise<{ defaultRoleId: string | null }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { roleId } = body;

        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (roleId) {
            const role = await this.roleRepo.findById(roleId);
            if (!role) {
                this.setStatus(404);
                throw new Error(ErrorMessages.ROLE.NOT_FOUND);
            }
            if (role.serverId.toString() !== serverId) {
                this.setStatus(400);
                throw new Error(ErrorMessages.ROLE.NOT_IN_SERVER);
            }
            if (role.name && role.name.trim().toLowerCase() === '@everyone') {
                this.setStatus(400);
                throw new Error(ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT);
            }
        }

        const server = await this.serverRepo.update(serverId, {
            defaultRoleId: roleId || undefined,
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_updated', {
            serverId,
            server,
        });

        return { defaultRoleId: roleId || null };
    }

    // Deletes a server and all associated data (channels, members, roles, etc.)
    // Enforces that only the server owner can perform this action
    @Delete('{serverId}')
    @Security('jwt')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.ONLY_OWNER_DELETE,
    })
    @Response<ErrorResponse>('404', 'Server not found', {
        error: ErrorMessages.SERVER.NOT_FOUND,
    })
    public async deleteServer(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const server = await this.serverRepo.findById(serverId);
        if (!server) {
            this.setStatus(404);
            throw new Error(ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.ownerId.toString() !== userId) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.ONLY_OWNER_DELETE);
        }

        await this.serverRepo.delete(serverId);
        await this.channelRepo.deleteByServerId(serverId);
        await this.serverMemberRepo.deleteByServerId(serverId);
        await this.roleRepo.deleteByServerId(serverId);
        await this.inviteRepo.deleteByServerId(serverId);
        await this.serverMessageRepo.deleteByServerId(serverId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_deleted', { serverId });

        return { message: 'Server deleted' };
    }

    // Uploads or updates the server icon
    // Resizes the image to 256x256 and enforces 'manageServer' permission
    @Post('{serverId}/icon')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FILE.NO_FILE_UPLOADED,
    })
    public async uploadServerIcon(
        @Path() serverId: string,
        @Request() req: express.Request,
        @UploadedFile() icon: Express.Multer.File,
    ): Promise<{ icon: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (!icon) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const filename = `${serverId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = icon.path || icon.buffer;
        if (!input) {
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.DATA_MISSING);
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
        await this.serverRepo.update(serverId, { icon: iconUrl });

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_icon_updated', {
            serverId,
            icon: iconUrl,
        });

        return { icon: iconUrl };
    }

    // Uploads or updates the server banner
    // Resizes the image to 960x540 and supports animated GIFs
    // Enforces 'manageServer' permission
    @Post('{serverId}/banner')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NO_PERMISSION_MANAGE,
    })
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.FILE.NO_FILE_UPLOADED,
    })
    public async uploadServerBanner(
        @Path() serverId: string,
        @Request() req: express.Request,
        @UploadedFile() banner: Express.Multer.File,
    ): Promise<{ banner: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageServer',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (!banner) {
            this.setStatus(400);
            throw new Error(ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const ext = banner.mimetype === 'image/gif' ? 'gif' : 'png';
        const filename = `${serverId}-banner-${Date.now()}.${ext}`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = banner.path || banner.buffer;
        if (!input) {
            this.setStatus(500);
            throw new Error(ErrorMessages.FILE.DATA_MISSING);
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
        await this.serverRepo.update(serverId, {
            banner: { type: 'image', value: bannerUrl },
        });

        const io = getIO();
        io.to(`server:${serverId}`).emit('server_banner_updated', {
            serverId,
            banner: { type: 'image', value: bannerUrl },
        });

        return { banner: bannerUrl };
    }
}
