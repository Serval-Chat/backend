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
import {
    ApiTags,
    ApiOperation,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { InteractionSuccessResponseDTO } from '@/controllers/dto/interaction.response.dto';
import { Types } from 'mongoose';

import { TYPES } from '@/di/types';
import { getDocumentId } from '@/utils/mongooseId';
import { generateSnowflakeId, isValidSnowflakeId } from '@/utils/snowflake';
import type { IWsServer } from '@/ws/interfaces/IWsServer';

import type {
    IInteractionCreateServerEvent,
    IComponentInteractionCreateServerEvent,
} from '@/ws/protocol/events/messages';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';
import type { ISlashCommand } from '@/models/SlashCommand';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { NoBot } from '@/modules/auth/bot.decorator';
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
import {
    CreateInteractionRequestDTO,
    CreateComponentInteractionRequestDTO,
    BotInteractionRespondDTO,
} from './dto/interaction.request.dto';
import { InteractionOptionValue } from './dto/types.dto';
import { SlashCommandOptionType } from '@/types/interactions';
import { assertHttpNotMuted } from '@/utils/mute';
import { mapPublicServerMember } from '@/utils/serverMember';
import type { IEmbed, IEmbedButton } from '@/models/Embed';

interface InteractionOption {
    name: string;
    value: InteractionOptionValue;
    type?: SlashCommandOptionType;
}

interface InteractionOptionDef {
    name: string;
    description?: string;
    type: SlashCommandOptionType;
    required?: boolean;
}

interface InteractionCommand {
    id: string;
    botId?: string;
    name: string;
    description: string;
    options: InteractionOptionDef[];
    shouldReply?: boolean;
}

const mapToInteractionCommand = (cmd: ISlashCommand): InteractionCommand => {
    return {
        id: cmd.snowflakeId,
        botId: cmd.botId,
        name: cmd.name,
        description: cmd.description,
        options: (cmd.options ?? []).map((opt) => ({
            name: opt.name,
            description: opt.description,
            type: opt.type,
            required: opt.required,
        })),
        shouldReply: cmd.shouldReply,
    };
};

interface PopulatedUser {
    _id: Types.ObjectId;
    snowflakeId: string;
    username: string;
    displayName?: string;
    profilePicture?: string;
    isBot?: boolean;
}

interface PopulatedServerMember {
    _id: Types.ObjectId;
    userId: string;
    userIdUser: PopulatedUser;
    serverId: Types.ObjectId;
    communicationDisabledUntil?: Date;
}

const SYSTEM_COMMANDS: InteractionCommand[] = [
    {
        id: 'system-timeout',
        name: 'timeout',
        description: 'Time out a member for a specified duration',
        options: [
            {
                name: 'user',
                description: 'The username or ID of the user to time out',
                type: SlashCommandOptionType.STRING,
                required: true,
            },
            {
                name: 'duration',
                description: 'Duration in minutes',
                type: SlashCommandOptionType.STRING,
                required: true,
            },
            {
                name: 'reason',
                description: 'Reason for the timeout',
                type: SlashCommandOptionType.STRING,
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
                type: SlashCommandOptionType.STRING,
                required: true,
            },
        ],
        shouldReply: true,
    },
    {
        id: 'system-nick',
        name: 'nick',
        description: 'Set your nickname in this server',
        options: [
            {
                name: 'nickname',
                description: 'Your new nickname, or leave blank to clear',
                type: SlashCommandOptionType.STRING,
                required: false,
            },
            {
                name: 'user',
                description:
                    'The username or ID of the user to change nickname for',
                type: SlashCommandOptionType.STRING,
                required: false,
            },
        ],
        shouldReply: false,
    },
];

@ApiTags('Interactions')
@ApiBearerAuth()
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
        @Inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('servers/:serverId/commands')
    @ApiOperation({ summary: 'Get available commands for a server' })
    @ApiOkResponse({
        description: 'Array of slash commands',
        type: Object,
        isArray: true,
    })
    public async getServerCommands(
        @Req() req: AuthenticatedRequest,
        @Param('serverId') serverId: string,
    ) {
        if (!isValidSnowflakeId(serverId)) {
            throw new NotFoundException('Invalid serverId');
        }

        const member = await ServerMember.findOne({
            serverId: serverId,
            userId: req.user.id,
        }).lean();

        if (member === null) {
            throw new ForbiddenException('Not a member of this server');
        }

        const botsInServer = await ServerMember.find({
            serverId: serverId,
        })
            .populate<{
                userIdUser: { isBot: boolean; snowflakeId: string };
            }>('userIdUser', 'isBot snowflakeId')
            .lean();

        const botUserIds = botsInServer
            .filter((m) => m.userIdUser.isBot === true)
            .map((m) => m.userIdUser.snowflakeId);

        const bots = await Bot.find({ userId: { $in: botUserIds } }).lean();

        const commandArrays = await Promise.all(
            bots.map((b) => this.slashCommandRepo.findByBotId(b.snowflakeId)),
        );

        const botCommands = commandArrays.flat().map((cmd) => ({
            id: cmd.snowflakeId,
            name: cmd.name,
            description: cmd.description,
            options: cmd.options !== undefined ? cmd.options : [],
        }));

        return [...SYSTEM_COMMANDS, ...botCommands];
    }

    @UseGuards(JwtAuthGuard)
    @Post('interactions')
    @NoBot()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Trigger a slash command interaction' })
    @ApiOkResponse({ type: InteractionSuccessResponseDTO })
    public async createInteraction(
        @Req() req: AuthenticatedRequest,
        @Body() body: CreateInteractionRequestDTO,
    ) {
        const { command, commandId, options, serverId, channelId } = body;
        if (req.user.isBot === true) {
            throw new ForbiddenException(
                'Bots are not allowed to run interactions',
            );
        }

        await assertHttpNotMuted(
            this.muteRepo,
            req.user.id,
            'use slash commands',
        );

        if (!isValidSnowflakeId(serverId) || !isValidSnowflakeId(channelId)) {
            throw new BadRequestException('Invalid serverId or channelId');
        }

        const member = await ServerMember.findOne({
            serverId: serverId,
            userId: req.user.id,
        }).lean();

        if (member === null) {
            throw new ForbiddenException('Not a member of this server');
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            req.user.id,
            channelId,
            'viewChannels',
            new ForbiddenException('Cannot view this channel'),
        );

        await this.permissionService.requireChannelPermission(
            serverId,
            req.user.id,
            channelId,
            'sendMessages',
            new ForbiddenException('Cannot send messages in this channel'),
        );

        const botsInServer = await ServerMember.find({
            serverId: serverId,
        })
            .populate<{
                userIdUser: { isBot: boolean; snowflakeId: string };
            }>('userIdUser', 'isBot snowflakeId')
            .lean();

        const botUserIds = botsInServer
            .filter((m) => m.userIdUser.isBot === true)
            .map((m) => m.userIdUser.snowflakeId);

        const bots = await Bot.find({ userId: { $in: botUserIds } }).lean();
        const botsById = new Map(bots.map((b) => [b.snowflakeId, b]));
        const botIds = bots.map((b) => b.snowflakeId);

        let commandDef: InteractionCommand | null = null;
        if (commandId !== undefined) {
            commandDef =
                SYSTEM_COMMANDS.find((c) => c.id === commandId) ?? null;
            if (commandDef === null && isValidSnowflakeId(commandId)) {
                const dbCmd = await this.slashCommandRepo.findById(commandId);
                if (
                    dbCmd !== null &&
                    botIds.some((botId) => botId === dbCmd.botId)
                ) {
                    commandDef = mapToInteractionCommand(dbCmd);
                }
            }
        }

        if (commandId !== undefined && commandDef === null) {
            throw new BadRequestException(
                `Command "/${command}" not found in this server`,
            );
        }

        if (commandDef === null) {
            commandDef =
                SYSTEM_COMMANDS.find((c) => c.name === command) ?? null;

            if (commandDef === null) {
                const dbCmd = await this.slashCommandRepo.findByNameAndBotIds(
                    command,
                    botIds,
                );
                if (dbCmd) {
                    commandDef = mapToInteractionCommand(dbCmd);
                }
            }
        }

        if (commandDef === null) {
            throw new BadRequestException(
                `Command "/${command}" not found in this server`,
            );
        }

        const resolvedCommandName = commandDef.name;
        const providedOptions = await this.resolveOptions(
            serverId,
            options !== undefined ? options : [],
            commandDef,
        );

        let invocationId: string | undefined;

        if (commandDef.shouldReply === true) {
            const serverMessage = await ServerMessage.create({
                serverId: serverId,
                channelId: channelId,
                senderId: req.user.id,
                text: '',
                interaction: {
                    command: resolvedCommandName,
                    options: providedOptions,
                    user: { id: req.user.id, username: req.user.username },
                },
            });
            invocationId = serverMessage.snowflakeId;

            this.wsServer.broadcastToChannel(channelId, {
                type: 'message_server',
                payload: {
                    messageId: invocationId,
                    id: invocationId,
                    serverId,
                    channelId,
                    senderId: req.user.id,
                    senderIsBot: req.user.isBot ?? false,
                    senderUsername: req.user.username,
                    text: '',
                    createdAt: serverMessage.createdAt.toISOString(),
                    isEdited: false,
                    isPinned: false,
                    isSticky: false,
                    isWebhook: false,
                    embeds: serverMessage.embeds ?? [],
                    components: serverMessage.components ?? [],
                    attachments: serverMessage.attachments ?? [],
                    reactions: [],
                    interaction: {
                        command: resolvedCommandName,
                        options: providedOptions,
                        user: { id: req.user.id, username: req.user.username },
                    },
                    stickerId: serverMessage.stickerId?.toString() ?? null,
                    poll: serverMessage.poll ?? null,
                },
            });
        }

        const senderPermissions =
            await this.permissionService.getAllServerPermissions(
                serverId,
                req.user.id,
            );

        const resolvedCommandId = commandDef.id;

        const interactionEvent = {
            type: 'interaction_create_server',
            payload: {
                command: resolvedCommandName,
                commandId: resolvedCommandId,
                options: providedOptions,
                serverId,
                channelId,
                senderId: req.user.id,
                senderUsername: req.user.username,
                senderPermissions,
                invocationId,
            },
        } as IInteractionCreateServerEvent;

        if (commandDef.botId !== undefined) {
            const targetBot = botsById.get(commandDef.botId);
            if (targetBot === undefined) {
                throw new BadRequestException(
                    `Command "/${resolvedCommandName}" not found in this server`,
                );
            }

            const targetBotUserId = targetBot.userId.toString();
            await this.permissionService.requireChannelPermission(
                serverId,
                targetBotUserId,
                channelId,
                'viewChannels',
                new ForbiddenException('Bot cannot view this channel'),
            );

            this.wsServer.broadcastToUser(targetBotUserId, interactionEvent);
        } else {
            await this.wsServer.broadcastToServerWithPermission(
                serverId,
                interactionEvent,
                {
                    type: 'channel',
                    targetId: channelId,
                    permission: 'viewChannels',
                },
            );
        }

        if (
            resolvedCommandName === 'timeout' ||
            resolvedCommandName === 'untimeout' ||
            resolvedCommandName === 'nick'
        ) {
            await this.handleSystemCommand(
                req.user.id,
                serverId,
                channelId,
                resolvedCommandName,
                providedOptions,
                invocationId,
            );
        }

        return { success: true };
    }

    @UseGuards(JwtAuthGuard)
    @Post('interactions/components')
    @NoBot()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Trigger a message component interaction' })
    @ApiOkResponse({ type: InteractionSuccessResponseDTO })
    public async createComponentInteraction(
        @Req() req: AuthenticatedRequest,
        @Body() body: CreateComponentInteractionRequestDTO,
    ) {
        if (req.user.isBot === true) {
            throw new ForbiddenException(
                'Bots are not allowed to run component interactions',
            );
        }

        await assertHttpNotMuted(
            this.muteRepo,
            req.user.id,
            'use message components',
        );

        const {
            serverId,
            channelId,
            messageId,
            componentIndex,
            customId,
            invocationId,
            botUserId,
        } = body;
        if (!isValidSnowflakeId(serverId) || !isValidSnowflakeId(channelId)) {
            throw new BadRequestException('Invalid serverId or channelId');
        }

        if (!Number.isInteger(componentIndex) || componentIndex < 0) {
            throw new BadRequestException('Invalid componentIndex');
        }

        const member = await ServerMember.findOne({
            serverId: serverId,
            userId: req.user.id,
        }).lean();
        if (member === null) {
            throw new ForbiddenException('Not a member of this server');
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            req.user.id,
            channelId,
            'viewChannels',
            new ForbiddenException('Cannot view this channel'),
        );

        const isPersistentMessage = isValidSnowflakeId(messageId);

        if (!isPersistentMessage) {
            if (botUserId === undefined) {
                throw new BadRequestException(
                    'Ephemeral component interactions require botUserId',
                );
            }

            const botUser = await User.findOne({ snowflakeId: botUserId })
                .select('isBot')
                .lean();
            if (botUser?.isBot !== true) {
                throw new BadRequestException('Target bot not found');
            }

            const senderPermissions =
                await this.permissionService.getAllServerPermissions(
                    serverId,
                    req.user.id,
                );

            const event: IComponentInteractionCreateServerEvent = {
                type: 'component_interaction_create_server',
                payload: {
                    componentType: 'button',
                    customId,
                    messageId,
                    componentIndex,
                    serverId,
                    channelId,
                    senderId: req.user.id,
                    senderUsername: req.user.username,
                    senderPermissions,
                    invocationId: invocationId ?? generateSnowflakeId(),
                },
            };
            this.wsServer.broadcastToUser(botUserId, event);
            return { success: true };
        }

        const message = await ServerMessage.findOne({
            snowflakeId: messageId,
            serverId: serverId,
            channelId: channelId,
        }).lean();
        if (message === null) {
            throw new NotFoundException('Message not found');
        }

        const button = message.components?.[componentIndex];
        if (button === undefined) {
            throw new BadRequestException('Button not found');
        }
        if (button.custom_id !== customId) {
            throw new BadRequestException('Button not found');
        }
        if (button.disabled === true) {
            throw new BadRequestException('Button is disabled');
        }
        if (button.style === 'link') {
            throw new BadRequestException('Link buttons cannot be invoked');
        }

        const messageSender = await User.findOne({
            snowflakeId: message.senderId,
        })
            .select('isBot')
            .lean();
        if (messageSender?.isBot !== true) {
            throw new BadRequestException(
                'Only bot-authored message buttons can be invoked',
            );
        }

        const senderPermissions =
            await this.permissionService.getAllServerPermissions(
                serverId,
                req.user.id,
            );

        const generatedInvocationId = generateSnowflakeId();
        const event: IComponentInteractionCreateServerEvent = {
            type: 'component_interaction_create_server',
            payload: {
                componentType: 'button',
                customId,
                messageId,
                componentIndex,
                serverId,
                channelId,
                senderId: req.user.id,
                senderUsername: req.user.username,
                senderPermissions,
                invocationId: generatedInvocationId,
            },
        };

        this.wsServer.broadcastToUser(message.senderId.toString(), event);

        return { success: true };
    }

    @UseGuards(JwtAuthGuard)
    @Post('interactions/respond')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Send an optionally ephemeral bot interaction response',
    })
    @ApiOkResponse({ type: InteractionSuccessResponseDTO })
    public async respondToInteraction(
        @Req() req: AuthenticatedRequest,
        @Body() body: BotInteractionRespondDTO,
    ) {
        if (req.user.isBot !== true) {
            throw new ForbiddenException('Only bots can use this endpoint');
        }

        const {
            serverId,
            channelId,
            senderId,
            text,
            invocationId,
            ephemeral,
            components,
        } = body;

        if (!isValidSnowflakeId(serverId) || !isValidSnowflakeId(channelId)) {
            throw new BadRequestException('Invalid serverId or channelId');
        }

        const botMember = await ServerMember.findOne({
            serverId: serverId,
            userId: req.user.id,
        }).lean();

        if (botMember === null) {
            throw new ForbiddenException('Bot is not a member of this server');
        }

        await this.permissionService.requireChannelPermission(
            serverId,
            req.user.id,
            channelId,
            'viewChannels',
            new ForbiddenException('Bot cannot view this channel'),
        );

        const botUser = await User.findOne({ snowflakeId: req.user.id })
            .select('username profilePicture isBot')
            .lean();
        const botProfilePicture =
            botUser?.profilePicture !== undefined &&
            botUser.profilePicture !== ''
                ? `/api/v1/profile/picture/${botUser.profilePicture}`
                : null;

        if (ephemeral === true) {
            await this.sendEphemeralResponse(
                serverId,
                channelId,
                senderId,
                text ?? '',
                invocationId ?? undefined,
                {
                    id: req.user.id,
                    username: botUser?.username ?? req.user.username,
                    profilePicture: botProfilePicture,
                    isBot: botUser?.isBot ?? req.user.isBot,
                },
                body.embeds,
                components ?? [],
            );
        } else {
            const serverMessage = await ServerMessage.create({
                serverId: serverId,
                channelId: channelId,
                senderId: req.user.id,
                text: text ?? '',
                embeds: body.embeds,
                components,
            });

            this.wsServer.broadcastToChannel(channelId, {
                type: 'message_server',
                payload: {
                    messageId: serverMessage.snowflakeId,
                    id: serverMessage.snowflakeId,
                    serverId,
                    channelId,
                    senderId: req.user.id,
                    senderIsBot: req.user.isBot ?? true,
                    senderUsername: req.user.username,
                    text: serverMessage.text,
                    createdAt: serverMessage.createdAt.toISOString(),
                    isEdited: false,
                    isPinned: false,
                    isSticky: false,
                    isWebhook: false,
                    embeds: serverMessage.embeds ?? [],
                    components: serverMessage.components ?? [],
                    attachments: serverMessage.attachments ?? [],
                    reactions: [],
                    interaction: null,
                    stickerId: serverMessage.stickerId?.toString() ?? null,
                    poll: serverMessage.poll ?? null,
                },
            });
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
        const userOption = options.find((o) => o.name === 'user')?.value;
        const nicknameOption = options.find(
            (o) => o.name === 'nickname',
        )?.value;

        let isTargetingOther = false;
        if (userOption !== undefined) {
            if (
                typeof userOption === 'object' &&
                'id' in userOption &&
                userOption.id !== actorId
            ) {
                isTargetingOther = true;
            } else if (
                typeof userOption === 'string' &&
                userOption !== actorId
            ) {
                isTargetingOther = true;
            }
        }

        if (
            command === 'timeout' ||
            command === 'untimeout' ||
            (command === 'nick' && isTargetingOther)
        ) {
            const canModerate = await this.permissionService.hasPermission(
                serverId,
                actorId,
                'moderateMembers',
            );

            if (canModerate !== true) {
                await this.sendEphemeralResponse(
                    serverId,
                    channelId,
                    actorId,
                    'You do not have permission to use this command on other users.',
                    invocationId,
                );
                return;
            }
        }

        if (
            userOption === undefined &&
            (command === 'timeout' || command === 'untimeout')
        )
            return;

        const userOptionIsSnowflake: boolean = isValidSnowflakeId(userOption);

        const findMemberByUserId = async (
            uid: string,
        ): Promise<PopulatedServerMember | null> =>
            (await ServerMember.findOne({
                serverId,
                userId: uid,
            }).populate<{ userIdUser: PopulatedUser }>(
                'userIdUser',
            )) as PopulatedServerMember | null;

        let targetMember: PopulatedServerMember | null = null;
        if (userOption === undefined) {
            targetMember = await findMemberByUserId(actorId);
        } else if (typeof userOption === 'object' && 'id' in userOption) {
            targetMember = await findMemberByUserId(userOption.id);
        } else if (userOptionIsSnowflake && typeof userOption === 'string') {
            targetMember = await findMemberByUserId(userOption);
        } else if (typeof userOption === 'string') {
            const escaped = userOption.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const foundUser = await User.findOne({
                $or: [
                    { username: new RegExp(`^${escaped}$`, 'i') },
                    { displayName: new RegExp(`^${escaped}$`, 'i') },
                ],
            }).lean();

            if (foundUser !== null) {
                targetMember = await findMemberByUserId(foundUser.snowflakeId);
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

        const targetUserId = targetMember.userIdUser.snowflakeId;

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
                { _id: getDocumentId(targetMember) as Types.ObjectId },
                { $set: { communicationDisabledUntil: until } },
            );

            const updatedMember = await ServerMember.findById(
                getDocumentId(targetMember) as Types.ObjectId,
            ).lean();
            if (updatedMember !== null) {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'member_updated',
                    payload: {
                        serverId,
                        userId: targetUserId,
                        member: mapPublicServerMember(updatedMember),
                    },
                });
            }

            await this.sendResponse(
                serverId,
                channelId,
                `**${targetMember.userIdUser.username}** has been timed out for ${duration} minutes. Reason: ${reason}`,
                invocationId,
            );
        } else if (command === 'untimeout') {
            await ServerMember.updateOne(
                { _id: getDocumentId(targetMember) as Types.ObjectId },
                { $unset: { communicationDisabledUntil: 1 } },
            );

            const updatedMember = await ServerMember.findById(
                getDocumentId(targetMember) as Types.ObjectId,
            ).lean();
            if (updatedMember !== null) {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'member_updated',
                    payload: {
                        serverId,
                        userId: targetUserId,
                        member: mapPublicServerMember(updatedMember),
                    },
                });
            }
            await this.sendResponse(
                serverId,
                channelId,
                `Timeout removed from **${targetMember.userIdUser.username}**.`,
                invocationId,
            );
        } else if (command === 'nick') {
            const nicknameStr =
                typeof nicknameOption === 'string' ? nicknameOption.trim() : '';

            if (nicknameStr.length > 32) {
                await this.sendEphemeralResponse(
                    serverId,
                    channelId,
                    actorId,
                    'Nickname cannot exceed 32 characters.',
                    invocationId,
                );
                return;
            }

            if (nicknameStr.length > 0) {
                await ServerMember.updateOne(
                    { _id: getDocumentId(targetMember) as Types.ObjectId },
                    { $set: { nickname: nicknameStr } },
                );
            } else {
                await ServerMember.updateOne(
                    { _id: getDocumentId(targetMember) as Types.ObjectId },
                    { $unset: { nickname: 1 } },
                );
            }

            const updatedMember = await ServerMember.findById(
                getDocumentId(targetMember) as Types.ObjectId,
            ).lean();
            if (updatedMember !== null) {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'member_updated',
                    payload: {
                        serverId,
                        userId: targetUserId,
                        member: mapPublicServerMember(updatedMember),
                    },
                });
            }

            if (nicknameStr.length > 0) {
                await this.sendEphemeralResponse(
                    serverId,
                    channelId,
                    actorId,
                    `Nickname changed to **${nicknameStr}**.`,
                    invocationId,
                );
            } else {
                await this.sendEphemeralResponse(
                    serverId,
                    channelId,
                    actorId,
                    `Nickname cleared.`,
                    invocationId,
                );
            }
        }
    }

    private async sendEphemeralResponse(
        serverId: string,
        channelId: string,
        userId: string,
        text: string,
        invocationId?: string,
        sender?: {
            id: string;
            username: string;
            profilePicture?: string | null;
            isBot?: boolean;
        },
        embeds: IEmbed[] = [],
        components: IEmbedButton[] = [],
    ) {
        this.wsServer.broadcastToUser(userId, {
            type: 'interaction_response_server',
            payload: {
                serverId,
                channelId,
                text,
                senderId: sender?.id,
                senderUsername: sender?.username,
                senderIsBot: sender?.isBot ?? true,
                senderProfilePicture: sender?.profilePicture ?? null,
                embeds,
                components,
                invocationId,
                ephemeral: true,
            },
        });
    }

    private async sendResponse(
        serverId: string,
        channelId: string,
        text: string,
        invocationId?: string,
    ) {
        if (invocationId === undefined || invocationId === '') return;

        await ServerMessage.updateOne(
            { snowflakeId: invocationId },
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
                isEdited: false,
            },
        });
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
                if (def.type === SlashCommandOptionType.USER) {
                    resolvedValue = await this.resolveUser(serverId, opt.value);
                } else if (def.type === SlashCommandOptionType.CHANNEL) {
                    resolvedValue = await this.resolveChannel(
                        serverId,
                        opt.value,
                    );
                } else if (def.type === SlashCommandOptionType.ROLE) {
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
        } else if (isValidSnowflakeId(value)) {
            userId = value;
        }

        let user;
        if (userId !== undefined && userId !== '') {
            user = await User.findOne({ snowflakeId: userId }).lean();
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
                        serverId: serverId,
                        userId: u.snowflakeId,
                    }).lean();
                    if (member) {
                        user = u;
                        break;
                    }
                }

                if (user === undefined) {
                    for (const u of foundUsers) {
                        const ban = await ServerBan.findOne({
                            serverId: serverId,
                            userId: u.snowflakeId,
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

        return {
            id: user.snowflakeId,
            username: user.username,
            displayName: user.displayName,
            profilePicture: user.profilePicture,
            isBot: user.isBot,
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
        } else if (isValidSnowflakeId(value)) {
            channelId = value;
        }

        let channel;
        if (channelId !== undefined && channelId !== '') {
            channel = await Channel.findOne({
                serverId: serverId,
                snowflakeId: channelId,
            }).lean();
        } else {
            channel = await Channel.findOne({
                serverId: serverId,
                name: new RegExp(
                    `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                    'i',
                ),
            }).lean();
        }

        if (channel === null)
            throw new Error(`Channel "${value}" not found in this server`);

        return {
            id: channel.snowflakeId,
            name: channel.name,
            type: channel.type,
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
        } else if (isValidSnowflakeId(value)) {
            roleId = value;
        }

        let role;
        if (roleId !== undefined && roleId !== '') {
            role = await Role.findOne({
                serverId: serverId,
                snowflakeId: roleId,
            }).lean();
        } else {
            role = await Role.findOne({
                serverId: serverId,
                name: new RegExp(
                    `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                    'i',
                ),
            }).lean();
        }

        if (role === null)
            throw new Error(`Role "${value}" not found in this server`);

        return {
            id: role.snowflakeId,
            name: role.name,
            color: role.color,
        };
    }
}
