import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Inject,
    HttpCode,
    HttpStatus,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { injectable } from 'inversify';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import { TYPES } from '@/di/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Bot, DEFAULT_BOT_PERMISSIONS } from '@/models/Bot';
import type { BotPermissions } from '@/models/Bot';
import { User } from '@/models/User';
import { Server, ServerMember, ServerBan, Role } from '@/models/Server';
import { generateJWT } from '@/utils/jwt';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { FileInterceptor } from '@nestjs/platform-express';
import { storage, imageFileFilter } from '@/config/multer';
import {
    processAndSaveImage,
    ImagePresets,
    getImageMetadata,
} from '@/utils/imageProcessing';
import { ErrorMessages } from '@/constants/errorMessages';
import fs from 'fs';
import path from 'path';
import { mapUser } from '@/utils/user';
import { IsHumanGuard } from '@/modules/auth/bot.guard';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IRoleRepository } from '@/di/interfaces/IRoleRepository';
import {
    bitmaskToPermissions,
    mapBotToServerPermissions,
} from '@/utils/botPermissions';
import { PermissionService } from '@/permissions/PermissionService';
import {
    GetBotTokenRequestDTO,
    CreateBotRequestDTO,
    UpdateBotRequestDTO,
    UpdateBotPermissionsRequestDTO,
    AuthorizeBotRequestDTO,
    UpdateBotCommandsRequestDTO,
} from './dto/bot.request.dto';

async function hashSecret(secret: string): Promise<string> {
    return bcrypt.hash(secret, 12);
}

async function verifySecret(secret: string, hash: string): Promise<boolean> {
    if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
        return bcrypt.compare(secret, hash);
    }
    const sha256 = crypto.createHash('sha256').update(secret).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sha256), Buffer.from(hash));
}

function generateClientId(): string {
    return crypto.randomBytes(16).toString('hex');
}

function generateClientSecret(): string {
    return crypto.randomBytes(32).toString('hex');
}

function validateClientId(clientId: string): void {
    if (!/^[a-f0-9]{32}$/.test(clientId)) {
        throw new BadRequestException('Invalid clientId format');
    }
}

function isSafeMediaFilename(filename: string): boolean {
    return /^[a-f0-9]{32}\.(webp|gif)$/.test(filename);
}

async function sanitizeBotUsername(name: string): Promise<string> {
    const base =
        name
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 28) || 'bot';

    const existing = await User.findOne({ username: base }).lean();
    if (!existing) return base;

    const suffix = crypto.randomBytes(2).toString('hex');
    return `${base}_${suffix}`;
}

@ApiTags('Bots')
@ApiBearerAuth()
@injectable()
@Controller('api/v1/bots')
export class BotController {
    public constructor(
        @Inject(TYPES.WsServer) private wsServer: IWsServer,
        @Inject(TYPES.SlashCommandRepository)
        private slashCommandRepo: ISlashCommandRepository,
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
    ) {}
    @Get(':clientId/public')
    @ApiOperation({ summary: 'Public bot info (no auth)' })
    public async getPublicInfo(@Param('clientId') clientId: string) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId })
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor usernameGradient isBot',
            )
            .lean();

        if (bot === null) throw new NotFoundException('Bot not found');

        const botUser = bot.userId as unknown as {
            _id: Types.ObjectId;
            username: string;
            displayName?: string;
            bio?: string;
            profilePicture?: string;
            banner?: string;
        };

        const serverCount = await ServerMember.countDocuments({
            userId: botUser._id,
        });

        const mappedUser = mapUser(botUser);
        if (mappedUser === null)
            throw new NotFoundException('Bot user not found');

        return {
            clientId: bot.clientId,
            username: mappedUser.username,
            displayName: mappedUser.displayName,
            bio: mappedUser.bio,
            profilePicture: mappedUser.profilePicture,
            banner: mappedUser.banner,
            usernameGradient: mappedUser.usernameGradient,
            botPermissions: bot.botPermissions,
            serverCount,
        };
    }

    @Post('token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Exchange client credentials for a bot token' })
    public async getToken(@Body() body: GetBotTokenRequestDTO) {
        const { client_id, client_secret } = body;

        if (client_id === '' || client_secret === '') {
            throw new BadRequestException(
                'client_id and client_secret required',
            );
        }

        const bot = await Bot.findOne({ clientId: client_id })
            .select('+clientSecretHash')
            .populate('userId', 'username tokenVersion deletedAt isBot')
            .lean();

        if (bot === null) {
            throw new ForbiddenException('Invalid credentials');
        }

        const isValid = await verifySecret(client_secret, bot.clientSecretHash);
        if (!isValid) {
            throw new ForbiddenException('Invalid credentials');
        }

        const botUser = bot.userId as unknown as {
            _id: Types.ObjectId;
            username: string;
            tokenVersion: number;
            deletedAt?: Date;
            isBot: boolean;
        };

        if (botUser.deletedAt !== undefined) {
            throw new ForbiddenException('Bot account disabled');
        }

        const token = generateJWT({
            id: botUser._id.toString(),
            login: `bot.${client_id}`,
            username: botUser.username,
            tokenVersion: botUser.tokenVersion,
            isBot: true,
        });

        return { token };
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new bot application' })
    public async createBot(
        @Req() req: AuthenticatedRequest,
        @Body() body: CreateBotRequestDTO,
    ) {
        const { name, description } = body;

        if (name.trim().length === 0) {
            throw new BadRequestException('name is required');
        }
        if (name.trim().length > 32) {
            throw new BadRequestException('name must be 32 chars or fewer');
        }

        const ownerId = new Types.ObjectId(req.user.id);
        const botCount = await Bot.countDocuments({ ownerId });
        if (botCount >= 25) {
            throw new ForbiddenException('Maximum 25 bots per user');
        }

        const clientId = generateClientId();
        const clientSecret = generateClientSecret();
        const clientSecretHash = await hashSecret(clientSecret);

        const username = await sanitizeBotUsername(name.trim());
        const botUser = await User.create({
            login: `bot.${clientId}`,
            username,
            displayName: name.trim(),
            bio: description?.trim() ?? '',
            password: crypto.randomBytes(32).toString('hex'),
            isBot: true,
            tokenVersion: 0,
        });

        const bot = await Bot.create({
            clientId,
            clientSecretHash,
            userId: botUser._id,
            ownerId,
            botPermissions: { ...DEFAULT_BOT_PERMISSIONS },
        });

        const botDoc = await Bot.findById(bot._id)
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor isBot createdAt',
            )
            .lean();

        if (botDoc !== null) {
            const mappedUser = mapUser(botDoc.userId);
            if (mappedUser !== null) {
                botDoc.userId = mappedUser as unknown as Types.ObjectId;
            }
        }

        return { bot: botDoc, clientSecret };
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiOperation({ summary: "List caller's bots" })
    public async listBots(@Req() req: AuthenticatedRequest) {
        const ownerId = new Types.ObjectId(req.user.id);
        const bots = await Bot.find({ ownerId })
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor isBot createdAt',
            )
            .sort({ createdAt: -1 })
            .lean();
        return bots.map((b) => {
            const mappedUser = mapUser(b.userId);
            if (mappedUser !== null) {
                b.userId = mappedUser as unknown as Types.ObjectId;
            }
            return b;
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get(':clientId')
    @ApiOperation({ summary: 'Get bot detail (owner only)' })
    public async getBot(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId })
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor isBot createdAt',
            )
            .lean();

        if (bot === null) throw new NotFoundException('Bot not found');

        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        const mappedUser = mapUser(bot.userId);
        if (mappedUser !== null) {
            bot.userId = mappedUser as unknown as Types.ObjectId;
        }

        return bot;
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':clientId')
    @ApiOperation({
        summary: 'Update bot name/description/avatar (owner only)',
    })
    public async updateBot(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
        @Body() body: UpdateBotRequestDTO,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        const update: Record<string, unknown> = {};
        if (body.name !== undefined) {
            if (body.name.trim().length === 0)
                throw new BadRequestException('name cannot be empty');
            if (body.name.trim().length > 32)
                throw new BadRequestException('name must be 32 chars or fewer');
            update.displayName = body.name.trim();
        }
        if (body.description !== undefined)
            update.bio = body.description.trim();
        if (body.bannerColor !== undefined) {
            update.bannerColor = body.bannerColor
                ? body.bannerColor.trim()
                : null;
        }

        if (Object.keys(update).length > 0) {
            await User.findByIdAndUpdate(bot.userId, { $set: update });
        }

        const updated = await Bot.findOne({ clientId })
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor isBot createdAt',
            )
            .lean();

        if (updated !== null) {
            const mappedUser = mapUser(updated.userId);
            if (mappedUser !== null) {
                updated.userId = mappedUser as unknown as Types.ObjectId;
            }
        }

        return updated;
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':clientId/permissions')
    @ApiOperation({ summary: 'Update bot API permissions (owner only)' })
    public async updatePermissions(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
        @Body() body: UpdateBotPermissionsRequestDTO,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId });
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        const allowed: (keyof BotPermissions)[] = [
            'readMessages',
            'sendMessages',
            'manageMessages',
            'readUsers',
            'joinServers',
            'manageServer',
            'manageChannels',
            'manageMembers',
            'readReactions',
            'addReactions',
        ];

        for (const key of allowed) {
            if (key in body && typeof body[key] === 'boolean') {
                (bot.botPermissions as unknown as Record<string, boolean>)[
                    key
                ] = body[key] as boolean;
            }
        }

        bot.markModified('botPermissions');
        await bot.save();

        const updated = await Bot.findOne({ clientId })
            .populate(
                'userId',
                'username displayName bio profilePicture banner bannerColor isBot createdAt',
            )
            .lean();

        if (updated !== null) {
            const mappedUser = mapUser(updated.userId);
            if (mappedUser !== null) {
                updated.userId = mappedUser as unknown as Types.ObjectId;
            }
        }

        return updated;
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':clientId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete bot (owner only)' })
    public async deleteBot(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId });
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        await User.findByIdAndUpdate(bot.userId, { deletedAt: new Date() });
        await Bot.deleteOne({ clientId });

        return { message: 'Bot deleted' };
    }

    @UseGuards(JwtAuthGuard)
    @Post(':clientId/reset-secret')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset bot client secret (owner only)' })
    public async resetSecret(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId });
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        const newSecret = generateClientSecret();
        bot.clientSecretHash = await hashSecret(newSecret);
        await bot.save();
        await User.findByIdAndUpdate(bot.userId, { $inc: { tokenVersion: 1 } });

        return { clientSecret: newSecret };
    }

    @UseGuards(JwtAuthGuard)
    @Post(':clientId/reset-token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary:
            'Invalidate all existing bot tokens and return a new one (owner only)',
    })
    public async resetToken(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId })
            .populate('userId', 'username tokenVersion deletedAt isBot')
            .lean();

        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        const botUser = bot.userId as unknown as {
            _id: Types.ObjectId;
            username: string;
            tokenVersion: number;
            deletedAt?: Date;
            isBot: boolean;
        };

        if (botUser.deletedAt !== undefined) {
            throw new ForbiddenException('Bot account disabled');
        }

        const updatedUser = await User.findByIdAndUpdate(
            botUser._id,
            { $inc: { tokenVersion: 1 } },
            { new: true },
        ).lean();

        if (updatedUser === null) throw new NotFoundException('User not found');

        const token = generateJWT({
            id: botUser._id.toString(),
            login: `bot.${clientId}`,
            username: botUser.username,
            tokenVersion: updatedUser.tokenVersion ?? 0,
            isBot: true,
        });

        return { token };
    }

    @UseGuards(JwtAuthGuard, IsHumanGuard)
    @Post(':clientId/authorize')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Authorize bot to join a server (any server manager)',
    })
    public async authorizeToServer(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
        @Body() body: AuthorizeBotRequestDTO,
    ) {
        validateClientId(clientId);
        const { serverId } = body;
        if (!Types.ObjectId.isValid(serverId)) {
            throw new BadRequestException('Valid serverId required');
        }

        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.botPermissions.joinServers !== true) {
            throw new ForbiddenException(
                'Bot does not have joinServers permission',
            );
        }

        const serverOid = new Types.ObjectId(serverId);
        const callerOid = new Types.ObjectId(req.user.id);

        const server = await Server.findById(serverOid).lean();
        if (server === null || server.deletedAt !== undefined)
            throw new NotFoundException('Server not found');

        const isOwner = server.ownerId.toString() === req.user.id;
        if (!isOwner) {
            const membership = await ServerMember.findOne({
                serverId: serverOid,
                userId: callerOid,
            }).lean();
            if (membership === null)
                throw new ForbiddenException('Not a member of this server');

            const roles = await Role.find({
                _id: { $in: membership.roles },
            }).lean();
            const canManage = roles.some(
                (r) =>
                    r.permissions.administrator || r.permissions.manageServer,
            );
            if (!canManage) {
                throw new ForbiddenException(
                    'Manage Server permission required',
                );
            }
        }

        const botUserId = new Types.ObjectId(bot.userId.toString());

        const alreadyMember = await ServerMember.findOne({
            serverId: serverOid,
            userId: botUserId,
        }).lean();
        if (alreadyMember !== null) {
            throw new ConflictException('Bot is already in this server');
        }

        const banned = await ServerBan.findOne({
            serverId: serverOid,
            userId: botUserId,
        }).lean();
        if (banned !== null)
            throw new ForbiddenException('Bot is banned from this server');

        const botUser = await User.findById(botUserId).lean();
        if (botUser === null) throw new NotFoundException('Bot user not found');
        const botName = botUser.displayName ?? botUser.username;

        const position = 1;

        const requestedBotPerms =
            body.permissions !== undefined
                ? bitmaskToPermissions(body.permissions)
                : bot.botPermissions;

        const serverPerms = mapBotToServerPermissions(requestedBotPerms);

        const managedRole = await this.roleRepo.create({
            serverId: serverOid,
            name: botName,
            managed: true,
            managedBotId: bot._id,
            position,
            separateFromOtherRoles: true,
            permissions: {
                ...serverPerms,
                viewChannels: true, // Always allow viewing
                connect: true, // Always allow connecting
            },
            glowEnabled: false,
        });

        const roles: Types.ObjectId[] = [managedRole._id];
        const everyoneRole = await Role.findOne({
            serverId: serverOid,
            name: '@everyone',
        }).lean();
        if (everyoneRole !== null) roles.push(everyoneRole._id);
        if (server.defaultRoleId) roles.push(server.defaultRoleId);

        await ServerMember.create({
            serverId: serverOid,
            userId: botUserId,
            roles,
        });

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_created',
            payload: { serverId, role: managedRole },
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'member_added',
            payload: {
                serverId,
                userId: botUserId.toString(),
                username: botUser.username,
            },
        });

        return { serverId, serverName: server.name };
    }

    @UseGuards(JwtAuthGuard)
    @Get(':clientId/servers')
    @ApiOperation({ summary: 'List servers the bot is in (owner only)' })
    public async getBotServers(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        const isOwner = bot.ownerId.toString() === req.user.id;
        const isSelf = bot.userId.toString() === req.user.id;
        if (!isOwner && !isSelf) {
            throw new ForbiddenException('Not your bot');
        }

        const botUserId = new Types.ObjectId(bot.userId.toString());
        const count = await ServerMember.countDocuments({ userId: botUserId });

        return { count };
    }

    @UseGuards(JwtAuthGuard)
    @Get(':clientId/commands')
    @ApiOperation({ summary: 'Get slash commands for bot' })
    public async getBotCommands(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id) {
            throw new ForbiddenException('Not your bot');
        }

        return this.slashCommandRepo.findByBotId(bot._id);
    }

    @UseGuards(JwtAuthGuard)
    @Post(':clientId/commands')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Overwrite slash commands for bot' })
    public async updateBotCommands(
        @Req() req: AuthenticatedRequest,
        @Param('clientId') clientId: string,
        @Body() body: UpdateBotCommandsRequestDTO,
    ) {
        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');

        const isOwner = bot.ownerId.toString() === req.user.id;
        const isSelf = bot.userId.toString() === req.user.id;
        if (!isOwner && !isSelf) throw new ForbiddenException('Not your bot');

        await this.slashCommandRepo.deleteByBotId(bot._id);

        const created = [];
        for (const cmd of body.commands) {
            created.push(
                await this.slashCommandRepo.create({
                    botId: bot._id,
                    name: cmd.name.toLowerCase(),
                    description: cmd.description,
                    options: cmd.options || [],
                }),
            );
        }

        return created;
    }

    @Post(':clientId/picture')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('profilePicture', {
            storage,
            fileFilter: imageFileFilter,
            limits: { fileSize: 5 * 1024 * 1024 },
        }),
    )
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                profilePicture: { type: 'string', format: 'binary' },
            },
        },
    })
    @HttpCode(200)
    @ApiOperation({ summary: 'Upload bot profile picture (owner only)' })
    public async uploadProfilePicture(
        @UploadedFile() profilePicture: Express.Multer.File | undefined,
        @Param('clientId') clientId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        if (profilePicture === undefined)
            throw new BadRequestException(ErrorMessages.FILE.NO_FILE_UPLOADED);

        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id)
            throw new ForbiddenException('Not your bot');

        const MAX_SIZE = 5 * 1024 * 1024;
        if (profilePicture.size > MAX_SIZE) {
            const sizeMB = (profilePicture.size / (1024 * 1024)).toFixed(2);
            throw new BadRequestException(
                `File too large (${sizeMB}MB). Max 5MB.`,
            );
        }

        const botUser = await this.userRepo.findById(bot.userId);
        if (botUser === null) throw new NotFoundException('Bot user not found');

        if (
            botUser.profilePicture !== undefined &&
            botUser.profilePicture !== ''
        ) {
            const oldFilename = path.basename(botUser.profilePicture);
            if (isSafeMediaFilename(oldFilename)) {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'profiles',
                    oldFilename,
                );
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        const profilesDir = path.join(process.cwd(), 'uploads', 'profiles');
        if (!fs.existsSync(profilesDir))
            fs.mkdirSync(profilesDir, { recursive: true });

        const uploadedPath = profilePicture.path;
        try {
            const metadata = await getImageMetadata(uploadedPath);
            if (!metadata.width || !metadata.height)
                throw new BadRequestException(
                    'Could not read image dimensions',
                );
            if (metadata.width > 256 || metadata.height > 256)
                throw new BadRequestException(
                    `Max 256x256px. Got ${metadata.width}x${metadata.height}px`,
                );
            if (metadata.format !== 'webp' && metadata.format !== 'gif')
                throw new BadRequestException('Only WebP and GIF allowed.');

            const isAnimated = !!(
                metadata.pages !== undefined && metadata.pages > 1
            );
            const format = metadata.format === 'gif' ? 'gif' : 'webp';
            const filename = `${crypto.randomBytes(16).toString('hex')}.${format}`;
            const targetPath = path.join(profilesDir, filename);

            await processAndSaveImage(
                uploadedPath,
                targetPath,
                ImagePresets.profilePicture(
                    format as 'webp' | 'gif',
                    isAnimated,
                ),
            );

            await this.userRepo.updateProfilePicture(botUser._id, filename);
            const pictureUrl = `/api/v1/profile/picture/${filename}`;

            const serverIds = await this.serverMemberRepo.findServerIdsByUserId(
                botUser._id,
            );
            const updatePayload = {
                userId: botUser._id.toString(),
                profilePicture: pictureUrl,
            };
            serverIds.forEach((sid) => {
                this.wsServer.broadcastToServer(sid.toString(), {
                    type: 'user_updated',
                    payload: updatePayload,
                });
            });

            return { message: 'Avatar updated', profilePicture: pictureUrl };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Failed to process image',
            );
        } finally {
            if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        }
    }

    @Post(':clientId/banner')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('banner', {
            storage,
            fileFilter: imageFileFilter,
            limits: { fileSize: 5 * 1024 * 1024 },
        }),
    )
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: { banner: { type: 'string', format: 'binary' } },
        },
    })
    @HttpCode(200)
    @ApiOperation({ summary: 'Upload bot profile banner (owner only)' })
    public async uploadBanner(
        @UploadedFile() banner: Express.Multer.File | undefined,
        @Param('clientId') clientId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        if (banner === undefined)
            throw new BadRequestException(ErrorMessages.FILE.NO_FILE_UPLOADED);

        validateClientId(clientId);
        const bot = await Bot.findOne({ clientId }).lean();
        if (bot === null) throw new NotFoundException('Bot not found');
        if (bot.ownerId.toString() !== req.user.id)
            throw new ForbiddenException('Not your bot');

        const MAX_SIZE = 5 * 1024 * 1024;
        if (banner.size > MAX_SIZE) {
            const sizeMB = (banner.size / (1024 * 1024)).toFixed(2);
            throw new BadRequestException(
                `File too large (${sizeMB}MB). Max 5MB.`,
            );
        }

        const botUser = await this.userRepo.findById(bot.userId);
        if (botUser === null) throw new NotFoundException('Bot user not found');

        if (botUser.banner !== undefined && botUser.banner !== '') {
            const oldFilename = path.basename(botUser.banner);
            if (isSafeMediaFilename(oldFilename)) {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'banners',
                    oldFilename,
                );
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }

        const bannersDir = path.join(process.cwd(), 'uploads', 'banners');
        if (!fs.existsSync(bannersDir))
            fs.mkdirSync(bannersDir, { recursive: true });

        const uploadedPath = banner.path;
        try {
            const metadata = await getImageMetadata(uploadedPath);
            if (metadata.width === 0 || metadata.height === 0)
                throw new BadRequestException(
                    'Could not read image dimensions',
                );
            if (metadata.width > 1136 || metadata.height > 400)
                throw new BadRequestException(
                    `Max 1136x400px. Got ${metadata.width}x${metadata.height}px`,
                );
            if (metadata.format !== 'webp' && metadata.format !== 'gif')
                throw new BadRequestException('Only WebP and GIF allowed.');

            const isAnimated = !!(
                metadata.pages !== undefined && metadata.pages > 1
            );
            const format = metadata.format === 'gif' ? 'gif' : 'webp';
            const filename = `${crypto.randomBytes(16).toString('hex')}.${format}`;
            const targetPath = path.join(bannersDir, filename);

            await processAndSaveImage(
                uploadedPath,
                targetPath,
                ImagePresets.profileBanner(
                    format as 'webp' | 'gif',
                    isAnimated,
                ),
            );

            await this.userRepo.updateBanner(botUser._id, filename);
            const bannerUrl = `/api/v1/profile/banner/${filename}`;

            const serverIds = await this.serverMemberRepo.findServerIdsByUserId(
                botUser._id,
            );
            const bannerPayload = {
                username: botUser.username ?? '',
                banner: bannerUrl,
            };
            serverIds.forEach((sid) => {
                this.wsServer.broadcastToServer(sid.toString(), {
                    type: 'user_banner_updated',
                    payload: bannerPayload,
                });
            });

            return { message: 'Banner updated', banner: bannerUrl };
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Failed to process banner',
            );
        } finally {
            if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        }
    }
}
