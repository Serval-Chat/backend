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
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { injectable } from 'inversify';
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
import { PermissionService } from '@/permissions/PermissionService';
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
import mongoose from 'mongoose';
import { processAndSaveImage, ImagePresets } from '@/utils/imageProcessing';
import {
    CreateServerRequestDTO,
    UpdateServerRequestDTO,
    SetDefaultRoleRequestDTO,
} from './dto/server.request.dto';
import { UpdateDefaultRoleRequestDTO } from './dto/server-default-role.request.dto';
import {
    ServerStatsResponseDTO,
    ServerResponseDTO,
    SetDefaultRoleResponseDTO,
    UploadIconResponseDTO,
    UploadBannerResponseDTO,
} from './dto/server.response.dto';
import { EmojiResponseDTO } from './dto/emoji.response.dto';
import { PingService } from '@/services/PingService';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import { NoBot } from '@/modules/auth/bot.decorator';
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

    public constructor(
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @Inject(TYPES.ServerMessageRepository)
        private serverMessageRepo: IServerMessageRepository,
        @Inject(TYPES.ServerBanRepository)
        private serverBanRepo: IServerBanRepository,
        @Inject(TYPES.ServerChannelReadRepository)
        private serverChannelReadRepo: IServerChannelReadRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.PingService)
        private pingService: PingService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.RedisService)
        private redisService: IRedisService,
    ) {
        if (fs.existsSync(this.UPLOADS_DIR) === false) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    @Get()
    @ApiOperation({ summary: 'Get user servers' })
    @ApiResponse({ status: 200, type: [ServerResponseDTO] })
    public async getServers(@Req() req: Request): Promise<IServer[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);
        const memberships = await this.serverMemberRepo.findByUserId(userOid);
        const serverIds = memberships.map((m) => m.serverId);
        const servers = await this.serverRepo.findByIds(serverIds);

        return await Promise.all(
            servers.map(async (server) => {
                const memberCount = await this.serverMemberRepo.countByServerId(
                    server._id,
                );
                const canManage = (await this.permissionService.hasPermission(
                    server._id as Types.ObjectId,
                    userOid,
                    'manageServer',
                )) === true;
                return {
                    ...server,
                    memberCount,
                    canManage,
                };
            }),
        );
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @NoBot()
    @ApiOperation({ summary: 'Create server' })
    @ApiResponse({ status: 201, description: 'Server created' })
    @ApiResponse({ status: 400, description: 'Invalid name' })
    public async createServer(
        @Req() req: Request,
        @Body() body: CreateServerRequestDTO,
    ): Promise<{ server: IServer; channel: IChannel }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);
        const { name } = body;

        const server = await this.serverRepo.create({
            name: name.trim(),
            ownerId: userOid,
        });

        // Initialize default '@everyone' role with default permissions
        await this.roleRepo.create({
            serverId: server._id,
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
                pinMessages: false,
            },
        });

        // Create initial '#general' text channel
        const channel = await this.channelRepo.create({
            serverId: server._id,
            name: 'general',
            type: 'text',
            position: 0,
        });

        // Automatically add the creator as the first member
        await this.serverMemberRepo.create({
            serverId: server._id,
            userId: userOid,
            roles: [],
        });

        return { server, channel };
    }

    @Get('unread')
    @ApiOperation({ summary: 'Get unread status' })
    @ApiResponse({ status: 200, description: 'Unread status per server' })
    public async getUnreadStatus(
        @Req() req: Request,
    ): Promise<Record<string, { hasUnread: boolean; pingCount: number }>> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);
        const memberships = await this.serverMemberRepo.findByUserId(userOid);
        const serverIds = memberships.map((m) => m.serverId);

        if (serverIds.length === 0) return {};

        const channels = await this.channelRepo.findByServerIds(serverIds);
        const reads = await this.serverChannelReadRepo.findByUserId(userOid);
        const pings = await this.pingService.getPingsForUser(userOid);

        const readMap = new Map<string, Date>();
        reads.forEach((read) =>
            readMap.set(read.channelId.toString(), read.lastReadAt),
        );

        const pingCounts: Record<string, number> = {};
        pings.forEach((p) => {
            if (p.serverId !== undefined) {
                pingCounts[p.serverId] = (pingCounts[p.serverId] ?? 0) + 1;
            }
        });

        const unreadMap: Record<string, boolean> = {};
        serverIds.forEach((id) => (unreadMap[id.toString()] = false));

        const permissionMapsByServer = new Map<string, Map<string, boolean>>();

        for (const serverId of serverIds) {
            const serverIdStr = serverId.toString();
            const serverChannels = channels.filter(
                (c) => c.serverId.toString() === serverIdStr,
            );
            if (serverChannels.length === 0) continue;

            const perms = await this.permissionService.hasChannelPermissions(
                serverId as Types.ObjectId,
                userOid,
                serverChannels.map((c) => c._id as Types.ObjectId),
                'viewChannels',
            );
            permissionMapsByServer.set(serverIdStr, perms);
        }

        // A server is unread if any of its channels have a message newer than the user's last read timestamp
        for (const channel of channels) {
            const serverIdStr = channel.serverId.toString();
            if (unreadMap[serverIdStr] === true) continue;
            if (channel.type === 'link') continue;

            const hasPerm = permissionMapsByServer
                .get(serverIdStr)
                ?.get(channel._id.toString());
            if (hasPerm !== true) continue;

            const lastMessageAt = channel.lastMessageAt;
            if (lastMessageAt === undefined) continue;

            const lastReadAt = readMap.get(channel._id.toString());
            if (lastReadAt === undefined || new Date(lastMessageAt) > new Date(lastReadAt)) {
                unreadMap[serverIdStr] = true;
            }
        }

        const result: Record<
            string,
            { hasUnread: boolean; pingCount: number }
        > = {};
        serverIds.forEach((id) => {
            const serverIdStr = id.toString();
            result[serverIdStr] = {
                hasUnread: unreadMap[serverIdStr] ?? false,
                pingCount: pingCounts[serverIdStr] ?? 0,
            };
        });

        return result;
    }

    @Get('emojis')
    @ApiOperation({ summary: 'Get all emojis from all joined servers' })
    @ApiResponse({ status: 200, description: 'Aggregate list of server emojis' })
    public async getAllServerEmojis(
        @Req() req: Request,
    ): Promise<EmojiResponseDTO[]> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const userOid = new Types.ObjectId(userId);

        const memberships = await this.serverMemberRepo.findByUserId(userOid);
        const serverIds = memberships.map((m) => m.serverId);

        if (serverIds.length === 0) return [];

        const EmojiModel = mongoose.model('Emoji');
        const emojis = await EmojiModel.find({
            serverId: { $in: serverIds },
        })
            .sort({ name: 1 })
            .exec();

        return emojis.map((e) => ({
            _id: e._id.toString(),
            name: e.name,
            imageUrl: e.imageUrl,
            serverId: (e.serverId !== undefined && e.serverId !== null) ? e.serverId.toString() : undefined,
            createdBy: (e.createdBy !== undefined && e.createdBy !== null) ? e.createdBy.toString() : undefined,
            createdAt: e.createdAt,
        }));
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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const channels = await this.channelRepo.findByServerId(serverOid);
        if (channels.length > 0) {
            const ServerChannelReadModel = mongoose.model('ServerChannelRead');
            // Bulk update read timestamps for all channels in the server
            const operations = channels.map((channel) => ({
                updateOne: {
                    filter: {
                        serverId: serverOid,
                        channelId: channel._id,
                        userId: userOid,
                    },
                    update: { $set: { lastReadAt: new Date() } },
                    upsert: true,
                },
            }));
            await ServerChannelReadModel.bulkWrite(operations);
        }

        await this.pingService.clearServerPings(userOid, serverOid);

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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        const memberCount =
            await this.serverMemberRepo.countByServerId(serverOid);

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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        const members = await this.serverMemberRepo.findByServerId(serverOid);
        const totalCount = members.length;

        const userIds = members.map((m) => m.userId);
        const users = await this.userRepo.findByIds(userIds);
        const userMap = new Map(users.map((u) => [u._id.toString(), u]));

        // Calculate online count by checking presence for each member
        let onlineCount = 0;
        for (const m of members) {
            const userIdStr = m.userId.toString();
            if (await this.wsServer.isUserOnline(userIdStr)) {
                onlineCount++;
            }
        }

        const bannedUsers = await this.serverBanRepo.findByServerId(serverOid);
        const bannedUserCount = bannedUsers.length;

        const owner = await this.userRepo.findById(server.ownerId);
        const ownerName = (owner !== null) ? (owner.displayName ?? owner.username ?? 'Unknown') : 'Unknown';

        // Identify the most recent member by join date
        const sortedMembers = [...members].sort((a, b) => {
            const dateA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const dateB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return dateB - dateA;
        });
        const newestMemberId = sortedMembers[0]?.userId.toString();
        const newestMemberUser = (newestMemberId !== undefined)
            ? userMap.get(newestMemberId)
            : null;
        const newestMember =
            newestMemberUser?.displayName ??
            newestMemberUser?.username ??
            'Unknown';

        const channels = await this.channelRepo.findByServerId(serverOid);
        const channelCount = channels.length;

        const EmojiModel = mongoose.model('Emoji');
        const emojiCount = await EmojiModel.countDocuments({
            serverId: serverOid,
        }).exec();

        // Update all-time high if current online count exceeds previous record
        let allTimeHigh = server.allTimeHigh ?? 0;
        if (onlineCount > allTimeHigh) {
            allTimeHigh = onlineCount;
            await this.serverRepo.update(serverOid, { allTimeHigh });
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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            )) !== true
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined && body.name !== '') updates.name = body.name;
        if (body.banner !== undefined) updates.banner = body.banner;
        if (body.disableCustomFonts !== undefined)
            updates.disableCustomFonts = body.disableCustomFonts;
            updates.disableUsernameGlowAndCustomColor =
                body.disableUsernameGlowAndCustomColor;

        if (body.tags !== undefined) updates.tags = body.tags;

        if (body.defaultRoleId !== undefined) {
            const roleId = body.defaultRoleId;
            if (roleId !== null && roleId !== '') {
                const role = await this.roleRepo.findById(
                    new Types.ObjectId(roleId),
                );
                if (role === null) {
                    throw new ApiError(404, ErrorMessages.ROLE.NOT_FOUND);
                }
                if (role.serverId.toString() !== serverId) {
                    throw new ApiError(400, ErrorMessages.ROLE.NOT_IN_SERVER);
                }
                if (role.name.trim().toLowerCase() === '@everyone') {
                    throw new ApiError(
                        400,
                        ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
                    );
                }
                updates.defaultRoleId = new Types.ObjectId(roleId);
            } else {
                updates.defaultRoleId = null;
            }
        }

        const existingServer = await this.serverRepo.findById(serverOid);
        const server = await this.serverRepo.update(serverOid, updates);
        if (server === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'server_updated',
            payload: {
                serverId,
                server,
                senderId: userId,
            },
        });

        const changes = [];
        if (existingServer !== null) {
            if (body.name !== undefined && body.name !== '' && body.name !== existingServer.name)
                changes.push({
                    field: 'name',
                    before: existingServer.name,
                    after: body.name,
                });
            if (body.banner !== undefined)
                changes.push({
                    field: 'banner',
                    before: existingServer.banner,
                    after: body.banner,
                });
            if (body.defaultRoleId !== undefined)
                changes.push({
                    field: 'defaultRoleId',
                    before: existingServer.defaultRoleId?.toString() ?? null,
                    after: body.defaultRoleId ?? null,
                });
            if (body.tags !== undefined && JSON.stringify(body.tags) !== JSON.stringify(existingServer.tags))
                changes.push({
                    field: 'tags',
                    before: existingServer.tags,
                    after: body.tags,
                });
        }

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'update_server',
                targetId: serverOid,
                targetType: 'server',
                changes,
            });
        }

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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const { roleId } = body;

        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            )) !== true
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (roleId !== null && roleId !== '') {
            const role = await this.roleRepo.findById(
                new Types.ObjectId(roleId),
            );
            if (role === null) {
                throw new ApiError(404, ErrorMessages.ROLE.NOT_FOUND);
            }
            if (role.serverId.toString() !== serverId) {
                throw new ApiError(400, ErrorMessages.ROLE.NOT_IN_SERVER);
            }
            if (role.name.trim().toLowerCase() === '@everyone') {
                throw new ApiError(
                    400,
                    ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
                );
            }
        }

        const existingServer = await this.serverRepo.findById(serverOid);
        const server = await this.serverRepo.update(serverOid, {
            defaultRoleId: (roleId !== null && roleId !== '') ? new Types.ObjectId(roleId) : undefined,
        });

        if (server !== null) {
            this.permissionService.invalidateCache(serverOid);
            this.wsServer.broadcastToServer(serverId.toString(), {
                type: 'server_updated',
                payload: {
                    serverId,
                    server,
                    senderId: userId,
                },
            });

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'update_server',
                targetId: serverOid,
                targetType: 'server',
                changes: [
                    {
                        field: 'defaultRoleId',
                        before:
                            existingServer?.defaultRoleId ? existingServer.defaultRoleId.toString() : null,
                        after: roleId,
                    },
                ],
            });
        }

        return { defaultRoleId: roleId };
    }

    @Post(':serverId/verification-request')
    @ApiOperation({ summary: 'Apply for server verification' })
    @ApiResponse({ status: 201, description: 'Verification requested' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 404, description: 'Server Not Found' })
    public async requestVerification(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<{ message: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        
        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }
        
        if (server.ownerId.toString() !== userId) {
            throw new ApiError(403, 'Only the server owner can apply for verification.');
        }

        if (server.verified === true || server.verificationRequested === true) {
            return { message: 'Already verified or request pending.' };
        }

        await this.serverRepo.update(serverOid, { verificationRequested: true });
        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: new Types.ObjectId(userId),
            actionType: 'request_server_verification',
            targetId: serverOid,
            targetType: 'server',
            changes: [{ field: 'verificationRequested', before: false, after: true }],
        });
        return { message: 'Verification requested' };
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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        if (server.ownerId.toString() !== userId) {
            throw new ApiError(403, ErrorMessages.SERVER.ONLY_OWNER_DELETE);
        }

        await this.serverRepo.delete(serverOid);
        await this.channelRepo.deleteByServerId(serverOid);
        await this.serverMemberRepo.deleteByServerId(serverOid);
        await this.roleRepo.deleteByServerId(serverOid);
        await this.inviteRepo.deleteByServerId(serverOid);
        await this.serverMessageRepo.deleteByServerId(serverOid);

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'server_deleted',
            payload: { serverId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'delete_server',
            targetId: serverOid,
            targetType: 'server',
            changes: [{ field: 'status', before: 'active', after: 'deleted' }],
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
        @UploadedFile() icon: Express.Multer.File | undefined,
    ): Promise<{ icon: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            )) !== true
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (icon === undefined) {
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const filename = `${serverId}-${Date.now()}.png`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = icon.path || icon.buffer;
        if (input === '') {
            throw new ApiError(500, ErrorMessages.FILE.DATA_MISSING);
        }

        await processAndSaveImage(
            input,
            filepath,
            ImagePresets.serverIcon(input),
        );

        // Cleanup temporary Multer file if it was written to disk
        if (icon.path !== '' && fs.existsSync(icon.path) === true) {
            fs.unlinkSync(icon.path);
        }

        const iconUrl = `/api/v1/servers/icon/${filename}`;
        const existingServer = await this.serverRepo.findById(serverOid);
        const updatedServer = await this.serverRepo.update(serverOid, {
            icon: iconUrl,
        });
        if (updatedServer === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'server_icon_updated',
            payload: {
                serverId,
                icon: iconUrl,
                senderId: userId,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'update_server',
            targetId: serverOid,
            targetType: 'server',
            changes: [
                {
                    field: 'icon',
                    before: existingServer?.icon ?? null,
                    after: iconUrl,
                },
            ],
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
        @UploadedFile() banner: Express.Multer.File | undefined,
    ): Promise<{ banner: string }> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            )) !== true
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (banner === undefined) {
            throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
        }

        const ext = banner.mimetype === 'image/gif' ? 'gif' : 'png';
        const filename = `${serverId}-banner-${Date.now()}.${ext}`;
        const filepath = path.join(this.UPLOADS_DIR, filename);

        const input = banner.path || banner.buffer;
        if (input === '') {
            throw new ApiError(500, ErrorMessages.FILE.DATA_MISSING);
        }

        await processAndSaveImage(
            input,
            filepath,
            ImagePresets.serverBanner(ext === 'gif'),
        );

        // Cleanup temporary Multer file if it was written to disk
        if (banner.path !== '' && fs.existsSync(banner.path) === true) {
            fs.unlinkSync(banner.path);
        }

        const bannerUrl = `/api/v1/servers/banner/${filename}`;
        const existingServer = await this.serverRepo.findById(serverOid);
        const updatedServer = await this.serverRepo.update(serverOid, {
            banner: { type: 'image', value: bannerUrl },
        });
        if (updatedServer === null) {
            throw new ApiError(404, ErrorMessages.SERVER.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId.toString(), {
            type: 'server_banner_updated',
            payload: {
                serverId,
                banner: { type: 'image', value: bannerUrl },
                senderId: userId,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'update_server',
            targetId: serverOid,
            targetType: 'server',
            changes: [
                {
                    field: 'banner',
                    before: existingServer?.banner ?? null,
                    after: bannerUrl,
                },
            ],
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
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const { roleId } = body;

        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageServer',
            )) !== true
        ) {
            throw new ApiError(403, ErrorMessages.SERVER.NO_PERMISSION_MANAGE);
        }

        if (roleId !== '') {
            const role = await this.roleRepo.findById(
                new Types.ObjectId(roleId),
            );
            if (role === null) {
                throw new ApiError(404, ErrorMessages.ROLE.NOT_FOUND);
            }
            if (role.serverId.toString() !== serverId) {
                throw new ApiError(400, ErrorMessages.ROLE.NOT_IN_SERVER);
            }
            if (role.name.trim().toLowerCase() === '@everyone') {
                throw new ApiError(
                    400,
                    ErrorMessages.ROLE.CANNOT_SET_EVERYONE_DEFAULT,
                );
            }
        }

        const existingServer = await this.serverRepo.findById(serverOid);
        const server = await this.serverRepo.update(serverOid, {
            defaultRoleId: (roleId !== '') ? new Types.ObjectId(roleId) : undefined,
        });

        if (server !== null) {
            this.wsServer.broadcastToServer(serverId, {
                type: 'server_updated',
                payload: {
                    serverId,
                    server,
                },
            });

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'update_server',
                targetId: serverOid,
                targetType: 'server',
                changes: [
                    {
                        field: 'defaultRoleId',
                        before:
                            existingServer?.defaultRoleId ? existingServer.defaultRoleId.toString() : null,
                        after: roleId,
                    },
                ],
            });
        }

        return { defaultRoleId: roleId };
    }

    @Get(':serverId/voice-states')
    @ApiOperation({ summary: 'Get current voice states' })
    @ApiResponse({ status: 200, description: 'Voice states map' })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    public async getVoiceStates(
        @Param('serverId') serverId: string,
        @Req() req: Request,
    ): Promise<Record<string, string[]>> {
        const userId = (req as Request & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ApiError(403, ErrorMessages.SERVER.NOT_MEMBER);
        }

        const redisClient = this.redisService.getClient();
        let cursor = '0';
        const scanMatch = `voice_channel:${serverId}:*`;
        const voiceStates: Record<string, string[]> = {};

        try {
            do {
                const [nextCursor, keys] = await redisClient.scan(
                    cursor,
                    'MATCH',
                    scanMatch,
                    'COUNT',
                    100,
                );
                cursor = nextCursor;

                for (const key of keys) {
                    const parts = key.split(':');
                    if (parts.length === 3) {
                        const [, , channelId] = parts;
                        const members = await redisClient.smembers(key);
                        if (members.length > 0 && channelId !== undefined && channelId !== '') {
                            voiceStates[channelId] = members;
                        }
                    }
                }
            } while (cursor !== '0');
        } catch (error) {
            this.logger.error(
                '[ServerController] Failed to fetch voice states for getVoiceStates:',
                error,
            );
        }

        return voiceStates;
    }
}
