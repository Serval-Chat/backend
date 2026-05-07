import {
    Controller,
    Get,
    Post,
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { injectable } from 'inversify';
import { Types } from 'mongoose';

import { TYPES } from '@/di/types';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { AnyResponseWsEvent } from '@/ws/protocol/envelope';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Bot } from '@/models/Bot';
import type { AuthenticatedRequest } from '@/middleware/auth';
import {
    ServerMember,
    ServerMessage,
    Channel,
    Role,
    ServerBan,
} from '@/models/Server';
import { User } from '@/models/User';
import { PermissionService } from '@/permissions/PermissionService';
import { CreateInteractionRequestDTO } from './dto/interaction.request.dto';
import { InteractionOptionValue } from './dto/types.dto';

interface InteractionOption {
    name: string;
    value: InteractionOptionValue;
    type?: number;
}

interface InteractionOptionDef {
    name: string;
    description?: string;
    type: number;
    required?: boolean;
}

interface InteractionCommand {
    id: string;
    name: string;
    description: string;
    options: InteractionOptionDef[];
    shouldReply?: boolean;
}

interface PopulatedUser {
    _id: Types.ObjectId;
    username: string;
    displayName?: string;
    profilePicture?: string;
    isBot?: boolean;
}

interface PopulatedServerMember {
    _id: Types.ObjectId;
    userId: PopulatedUser;
    serverId: Types.ObjectId;
    communicationDisabledUntil?: Date;
}

const SYSTEM_COMMANDS = [
    {
        id: 'system-timeout',
        name: 'timeout',
        description: 'Time out a member for a specified duration',
        options: [
            {
                name: 'user',
                description: 'The username or ID of the user to time out',
                type: 3, // STRING (for now, until we have a proper USER type in frontend)
                required: true,
            },
            {
                name: 'duration',
                description: 'Duration in minutes',
                type: 3, // STRING (Lexical currently sends everything as string)
                required: true,
            },
            {
                name: 'reason',
                description: 'Reason for the timeout',
                type: 3, // STRING
                required: false,
            },
        ],
        shouldReply: true,
    },
    {
        id: 'system-untimeout',
        name: 'untimeout',
        description: 'Remove a timeout from a member',
        options: [
            {
                name: 'user',
                description: 'The username or ID of the user to untimeout',
                type: 3, // STRING
                required: true,
            },
        ],
        shouldReply: true,
    },
];

@ApiTags('Interactions')
@ApiBearerAuth()
@injectable()
@Controller('api/v1')
export class InteractionController {
    public constructor(
        @Inject(TYPES.WsServer) private wsServer: IWsServer,
        @Inject(TYPES.SlashCommandRepository)
        private slashCommandRepo: ISlashCommandRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('servers/:serverId/commands')
    @ApiOperation({ summary: 'Get available commands for a server' })
    public async getServerCommands(
        @Req() req: AuthenticatedRequest,
        @Param('serverId') serverId: string,
    ) {
        if (!Types.ObjectId.isValid(serverId)) {
            throw new NotFoundException('Invalid serverId');
        }

        const member = await ServerMember.findOne({
            serverId: new Types.ObjectId(serverId),
            userId: new Types.ObjectId(req.user.id),
        }).lean();

        if (member === null) {
            throw new ForbiddenException('Not a member of this server');
        }

        const botsInServer = await ServerMember.find({
            serverId: new Types.ObjectId(serverId),
        })
            .populate<{ userId: { isBot: boolean; _id: Types.ObjectId } }>(
                'userId',
                'isBot _id',
            )
            .lean();

        const botUserIds = botsInServer
            .filter((m) => m.userId.isBot === true)
            .map((m) => m.userId._id);

        const bots = await Bot.find({ userId: { $in: botUserIds } }).lean();

        const commandArrays = await Promise.all(
            bots.map((b) => this.slashCommandRepo.findByBotId(b._id)),
        );

        const botCommands = commandArrays.flat().map((cmd) => ({
            id: cmd._id.toString(),
            name: cmd.name,
            description: cmd.description,
            options: cmd.options !== undefined ? cmd.options : [],
        }));

        return [...SYSTEM_COMMANDS, ...botCommands];
    }

    @UseGuards(JwtAuthGuard)
    @Post('interactions')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Trigger a slash command interaction' })
    public async createInteraction(
        @Req() req: AuthenticatedRequest,
        @Body() body: CreateInteractionRequestDTO,
    ) {
        const { command, options, serverId, channelId } = body;

        if (
            !Types.ObjectId.isValid(serverId) ||
            !Types.ObjectId.isValid(channelId)
        ) {
            throw new BadRequestException('Invalid serverId or channelId');
        }

        const member = await ServerMember.findOne({
            serverId: new Types.ObjectId(serverId),
            userId: new Types.ObjectId(req.user.id),
        }).lean();

        if (member === null) {
            throw new ForbiddenException('Not a member of this server');
        }

        const canView = await this.permissionService.hasChannelPermission(
            new Types.ObjectId(serverId),
            new Types.ObjectId(req.user.id),
            new Types.ObjectId(channelId),
            'viewChannels',
        );
        if (canView !== true)
            throw new ForbiddenException('Cannot view this channel');

        const canSend = await this.permissionService.hasChannelPermission(
            new Types.ObjectId(serverId),
            new Types.ObjectId(req.user.id),
            new Types.ObjectId(channelId),
            'sendMessages',
        );
        if (canSend !== true)
            throw new ForbiddenException(
                'Cannot send messages in this channel',
            );

        const botsInServer = await ServerMember.find({
            serverId: new Types.ObjectId(serverId),
        })
            .populate<{ userId: { isBot: boolean; _id: Types.ObjectId } }>(
                'userId',
                'isBot _id',
            )
            .lean();

        const botUserIds = botsInServer
            .filter((m) => m.userId.isBot === true)
            .map((m) => m.userId._id);

        const bots = await Bot.find({ userId: { $in: botUserIds } }).lean();
        const botIds = bots.map((b) => b._id);

        let commandDef: InteractionCommand | null =
            (SYSTEM_COMMANDS.find((c) => c.name === command) as unknown as
                | InteractionCommand
                | undefined) ?? null;

        if (commandDef === null) {
            commandDef = (await this.slashCommandRepo.findByNameAndBotIds(
                command,
                botIds,
            )) as unknown as InteractionCommand | null;
        }

        if (commandDef === null) {
            throw new BadRequestException(
                `Command "/${command}" not found in this server`,
            );
        }

        const providedOptions = await this.resolveOptions(
            serverId,
            options !== undefined ? options : [],
            commandDef,
        );

        let invocationId: string | undefined;

        if (commandDef.shouldReply === true) {
            const serverMessage = await ServerMessage.create({
                serverId: new Types.ObjectId(serverId),
                channelId: new Types.ObjectId(channelId),
                senderId: new Types.ObjectId(req.user.id),
                text: '',
                interaction: {
                    command,
                    options: providedOptions,
                    user: { id: req.user.id, username: req.user.username },
                },
            });
            invocationId = serverMessage._id.toString();

            this.wsServer.broadcastToChannel(channelId, {
                type: 'message_server',
                payload: {
                    messageId: invocationId,
                    serverId,
                    channelId,
                    senderId: req.user.id,
                    senderUsername: req.user.username,
                    text: '',
                    createdAt: serverMessage.createdAt.toISOString(),
                    isEdited: false,
                    isPinned: false,
                    isSticky: false,
                    isWebhook: false,
                    interaction: {
                        command,
                        options: providedOptions,
                        user: { id: req.user.id, username: req.user.username },
                    },
                },
            } as AnyResponseWsEvent);
        }

        const senderPermissions =
            await this.permissionService.getAllServerPermissions(
                new Types.ObjectId(serverId),
                new Types.ObjectId(req.user.id),
            );

        await this.wsServer.broadcastToServerWithPermission(
            serverId,
            {
                type: 'interaction_create_server',
                payload: {
                    command,
                    options: providedOptions,
                    serverId,
                    channelId,
                    senderId: req.user.id,
                    senderUsername: req.user.username,
                    senderPermissions,
                    invocationId,
                },
            },
            {
                type: 'channel',
                targetId: channelId,
                permission: 'viewChannels',
            },
        );

        if (command === 'timeout' || command === 'untimeout') {
            await this.handleSystemCommand(
                req.user.id,
                serverId,
                channelId,
                command,
                providedOptions,
                invocationId,
            );
        }

        return { success: true };
    }

    private async handleSystemCommand(
        actorId: string,
        serverId: string,
        channelId: string,
        command: string,
        options: InteractionOption[],
        invocationId?: string,
    ) {
        const canModerate = await this.permissionService.hasPermission(
            new Types.ObjectId(serverId),
            new Types.ObjectId(actorId),
            'moderateMembers',
        );

        if (canModerate !== true) {
            await this.sendEphemeralResponse(
                serverId,
                channelId,
                actorId,
                'You do not have permission to use this command.',
                invocationId,
            );
            return;
        }

        const userOption = options.find((o) => o.name === 'user')?.value;
        if (userOption === undefined) return;

        let targetMember: PopulatedServerMember | null = null;
        if (typeof userOption === 'object' && 'id' in userOption) {
            targetMember = (await ServerMember.findOne({
                serverId: new Types.ObjectId(serverId),
                userId: new Types.ObjectId(userOption.id as string),
            }).populate<{ userId: PopulatedUser }>(
                'userId',
            )) as unknown as PopulatedServerMember;
        } else if (
            typeof userOption === 'string' &&
            Types.ObjectId.isValid(userOption)
        ) {
            targetMember = (await ServerMember.findOne({
                serverId: new Types.ObjectId(serverId),
                userId: new Types.ObjectId(userOption),
            }).populate<{ userId: PopulatedUser }>(
                'userId',
            )) as unknown as PopulatedServerMember;
        } else if (typeof userOption === 'string') {
            const escaped = userOption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const foundUser = await User.findOne({
                $or: [
                    { username: new RegExp(`^${escaped}$`, 'i') },
                    { displayName: new RegExp(`^${escaped}$`, 'i') },
                ],
            }).lean();

            if (foundUser !== null) {
                targetMember = (await ServerMember.findOne({
                    serverId: new Types.ObjectId(serverId),
                    userId: foundUser._id,
                }).populate<{ userId: PopulatedUser }>(
                    'userId',
                )) as unknown as PopulatedServerMember;
            }
        }

        if (targetMember === null) {
            await this.sendEphemeralResponse(
                serverId,
                channelId,
                actorId,
                `User "${userOption}" not found in this server.`,
                invocationId,
            );
            return;
        }

        const targetUserId = targetMember.userId._id.toString();

        if (command === 'timeout') {
            const durationStr = options.find(
                (o) => o.name === 'duration',
            )?.value;
            const duration = parseInt(durationStr as string);
            const reason =
                options.find((o) => o.name === 'reason')?.value ??
                'No reason provided';

            if (isNaN(duration) || duration <= 0) {
                await this.sendEphemeralResponse(
                    serverId,
                    channelId,
                    actorId,
                    'Please provide a valid duration in minutes.',
                    invocationId,
                );
                return;
            }

            const until = new Date(Date.now() + duration * 60 * 1000);
            await ServerMember.updateOne(
                { _id: targetMember._id },
                { $set: { communicationDisabledUntil: until } },
            );

            const updatedMember = await ServerMember.findById(
                targetMember._id,
            ).lean();
            if (updatedMember !== null) {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'member_updated',
                    payload: {
                        serverId,
                        userId: targetUserId,
                        member: updatedMember,
                    },
                });
            }

            await this.sendResponse(
                serverId,
                channelId,
                `**${targetMember.userId.username}** has been timed out for ${duration} minutes. Reason: ${reason}`,
                invocationId,
            );
        } else if (command === 'untimeout') {
            await ServerMember.updateOne(
                { _id: targetMember._id },
                { $unset: { communicationDisabledUntil: 1 } },
            );

            const updatedMember = await ServerMember.findById(
                targetMember._id,
            ).lean();
            if (updatedMember !== null) {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'member_updated',
                    payload: {
                        serverId,
                        userId: targetUserId,
                        member: updatedMember,
                    },
                });
            }
            await this.sendResponse(
                serverId,
                channelId,
                `Timeout removed from **${targetMember.userId.username}**.`,
                invocationId,
            );
        }
    }

    private async sendEphemeralResponse(
        serverId: string,
        channelId: string,
        userId: string,
        text: string,
        invocationId?: string,
    ) {
        this.wsServer.broadcastToUser(userId, {
            type: 'interaction_response_server',
            payload: {
                serverId,
                channelId,
                text,
                invocationId,
                ephemeral: true,
            },
        } as unknown as AnyResponseWsEvent);
    }

    private async sendResponse(
        serverId: string,
        channelId: string,
        text: string,
        invocationId?: string,
    ) {
        if (invocationId === undefined || invocationId === '') return;

        await ServerMessage.updateOne(
            { _id: new Types.ObjectId(invocationId) },
            { $set: { text } },
        );

        this.wsServer.broadcastToChannel(channelId, {
            type: 'message_server_edited',
            payload: {
                messageId: invocationId,
                serverId,
                channelId,
                text,
                editedAt: new Date().toISOString(),
                isEdited: false, // It's a response, not a manual edit
            },
        } as unknown as AnyResponseWsEvent);
    }

    private async resolveOptions(
        serverId: string,
        providedOptions: InteractionOption[],
        commandDef: InteractionCommand,
    ): Promise<InteractionOption[]> {
        const resolved: InteractionOption[] = [];
        const optionDefs = commandDef.options;

        for (const def of optionDefs) {
            if (def.required === true) {
                const provided = providedOptions.find(
                    (o) => o.name === def.name,
                );
                if (provided === undefined || provided.value === '') {
                    throw new BadRequestException(
                        `Option "${def.name}" is required`,
                    );
                }
            }
        }

        for (const opt of providedOptions) {
            const def = optionDefs.find(
                (d: InteractionOptionDef) => d.name === opt.name,
            );
            if (!def) {
                resolved.push(opt);
                continue;
            }

            let resolvedValue = opt.value;
            try {
                if (def.type === 6) {
                    // USER
                    resolvedValue = await this.resolveUser(serverId, opt.value);
                } else if (def.type === 7) {
                    // CHANNEL
                    resolvedValue = await this.resolveChannel(
                        serverId,
                        opt.value,
                    );
                } else if (def.type === 8) {
                    // ROLE
                    resolvedValue = await this.resolveRole(serverId, opt.value);
                }
            } catch (e) {
                throw new BadRequestException(
                    `Failed to resolve option "${opt.name}": ${e instanceof Error ? e.message : e}`,
                );
            }

            resolved.push({ ...opt, value: resolvedValue, type: def.type });
        }
        return resolved;
    }

    private async resolveUser(
        serverId: string,
        value: InteractionOptionValue,
    ): Promise<InteractionOptionValue> {
        if (typeof value !== 'string') return value;

        let userId: string | undefined;

        const mentionMatch = value.match(/^<(?:userid:'|@!?)([^'>]+)'?>$/);
        if (mentionMatch !== null) {
            userId = mentionMatch[1];
        } else if (Types.ObjectId.isValid(value)) {
            userId = value;
        }

        let user;
        if (userId !== undefined && userId !== '') {
            user = await User.findById(userId).lean();
        } else {
            const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const foundUsers = await User.find({
                $or: [
                    { username: new RegExp(`^${escaped}$`, 'i') },
                    { displayName: new RegExp(`^${escaped}$`, 'i') },
                ],
            }).lean();

            if (foundUsers.length > 0) {
                for (const u of foundUsers) {
                    const member = await ServerMember.findOne({
                        serverId: new Types.ObjectId(serverId),
                        userId: u._id,
                    }).lean();
                    if (member) {
                        user = u;
                        break;
                    }
                }

                if (user === undefined) {
                    for (const u of foundUsers) {
                        const ban = await ServerBan.findOne({
                            serverId: new Types.ObjectId(serverId),
                            userId: u._id,
                        }).lean();
                        if (ban) {
                            user = u;
                            break;
                        }
                    }
                }

                if (user === undefined) user = foundUsers[0];
            }
        }

        if (user === undefined || user === null)
            throw new Error(`User "${value}" not found in this server`);

        const u = user as unknown as PopulatedUser;
        return {
            _id: u._id.toString(),
            id: u._id.toString(),
            username: u.username,
            displayName: u.displayName,
            profilePicture: u.profilePicture,
            isBot: u.isBot,
        };
    }

    private async resolveChannel(
        serverId: string,
        value: InteractionOptionValue,
    ): Promise<InteractionOptionValue> {
        if (typeof value !== 'string') return value;

        let channelId: string | undefined;

        const linkMatch = value.match(/\/channel\/([a-zA-Z0-9]+)/);
        if (linkMatch !== null) {
            channelId = linkMatch[1];
        } else if (Types.ObjectId.isValid(value)) {
            channelId = value;
        }

        let channel;
        if (channelId !== undefined && channelId !== '') {
            channel = await Channel.findOne({
                serverId: new Types.ObjectId(serverId),
                _id: new Types.ObjectId(channelId),
            }).lean();
        } else {
            channel = await Channel.findOne({
                serverId: new Types.ObjectId(serverId),
                name: new RegExp(
                    `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                    'i',
                ),
            }).lean();
        }

        if (channel === null)
            throw new Error(`Channel "${value}" not found in this server`);

        const c = channel as unknown as {
            _id: Types.ObjectId;
            name: string;
            type: string;
        };
        return {
            _id: c._id.toString(),
            id: c._id.toString(),
            name: c.name,
            type: c.type,
        };
    }

    private async resolveRole(
        serverId: string,
        value: InteractionOptionValue,
    ): Promise<InteractionOptionValue> {
        if (typeof value !== 'string') return value;

        let roleId: string | undefined;

        const mentionMatch = value.match(/^<roleid:'([^']+)'>$/);
        if (mentionMatch !== null) {
            roleId = mentionMatch[1];
        } else if (Types.ObjectId.isValid(value)) {
            roleId = value;
        }

        let role;
        if (roleId !== undefined && roleId !== '') {
            role = await Role.findOne({
                serverId: new Types.ObjectId(serverId),
                _id: new Types.ObjectId(roleId),
            }).lean();
        } else {
            role = await Role.findOne({
                serverId: new Types.ObjectId(serverId),
                name: new RegExp(
                    `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                    'i',
                ),
            }).lean();
        }

        if (role === null)
            throw new Error(`Role "${value}" not found in this server`);

        const r = role as unknown as {
            _id: Types.ObjectId;
            name: string;
            color?: string;
        };
        return {
            _id: r._id.toString(),
            id: r._id.toString(),
            name: r.name,
            color: r.color,
        };
    }
}
