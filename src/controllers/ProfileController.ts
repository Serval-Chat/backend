import {
    Controller,
    Get,
    Patch,
    Post,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Res,
    Inject,
    HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
    ApiProduces,
} from '@nestjs/swagger';
import {
    UpdateBioResponseDTO,
    UpdatePronounsResponseDTO,
    UpdateDisplayNameResponseDTO,
    UpdateCustomStatusResponseDTO,
    BulkStatusesResponseDTO,
    UpdateStyleResponseDTO,
    ChangeUsernameResponseDTO,
    UpdateLanguageResponseDTO,
    SimpleMessageResponseDTO,
    VerifyConnectionResponseDTO,
} from './dto/profile.extra.response.dto';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '@/middleware/auth';
import {
    UserProfileResponseDTO,
    UserLookupResponseDTO,
    UpdateProfilePictureResponseDTO,
    UpdateBannerResponseDTO,
    BadgeOperationResponseDTO,
    CreateWebsiteConnectionResponseDTO,
    UpdateAppearanceResponseDTO,
    PrivacySettingsDTO,
} from './dto/profile.response.dto';
import {
    UpdateBioRequestDTO,
    UpdatePronounsRequestDTO,
    UpdateDisplayNameRequestDTO,
    UpdateStatusRequestDTO,
    BulkStatusRequestDTO,
    UpdateStyleRequestDTO,
    ChangeUsernameRequestDTO,
    UpdateLanguageRequestDTO,
    AssignBadgesRequestDTO,
    FilenameParamDTO,
    CreateWebsiteConnectionRequestDTO,
    ConnectionParamDTO,
    UpdateAppearanceRequestDTO,
    UpdatePrivacySettingsRequestDTO,
} from './dto/profile.request.dto';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { hasPermission } from '@/utils/jwt';
import { mapUser } from '@/utils/user';
import {
    resolveSerializedCustomStatus,
    SerializedCustomStatus,
} from '@/utils/status';

import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import { TYPES } from '@/di/types';
import { IUserRepository, IUser } from '@/di/interfaces/IUserRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';
import { BlockFlags } from '@/privacy/blockFlags';
import { ILogger } from '@/di/interfaces/ILogger';
import { ImageDeliveryService } from '@/services/ImageDeliveryService';
import { NoBot } from '@/modules/auth/bot.decorator';

import { Badge } from '@/models/Badge';
import { Bot } from '@/models/Bot';
import { imageFileFilter, imageUploadLimits, storage } from '@/config/multer';
import type { WsServer } from '@/ws/server';
import { UserConnection, IUserConnection } from '@/models/UserConnection';
import {
    createWebsiteVerificationToken,
    getWebsiteVerificationFileUrl,
    hashWebsiteVerificationToken,
    isWebsiteVerificationFileContent,
    isWebsiteVerificationRecord,
    normalizeWebsite,
    resolveTxtRecordsViaDoh,
    WEBSITE_CONNECTION_TYPE,
    WEBSITE_VERIFICATION_FILE_PATH,
    WEBSITE_VERIFICATION_FAILURE,
    WEBSITE_VERIFICATION_PREFIX,
} from '@/utils/websiteConnections';
import { ScraperService } from '@/services/ScraperService';
import {
    processAndSaveImage,
    ImagePresets,
    getImageMetadata,
} from '@/utils/imageProcessing';
import { assertHttpNotMuted } from '@/utils/mute';

@ApiTags('Profile')
@Controller('api/v1/profile')
export class ProfileController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ImageDeliveryService)
        private imageDeliveryService: ImageDeliveryService,
        @Inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
        @Inject(TYPES.ScraperService)
        private scraperService: ScraperService,
        @Inject(TYPES.MuteRepository)
        private muteRepo: IMuteRepository,
    ) {}

    private mapConnection(connection: IUserConnection) {
        return {
            id: connection.snowflakeId,
            type: connection.type,
            value: connection.value,
            status: connection.status,
        };
    }

    private async getVerifiedConnections(userId: string) {
        const connections = await UserConnection.find({
            userId,
            status: 'verified',
        })
            .sort({ verifiedAt: 1, createdAt: 1 })
            .exec();

        return connections.map((connection) => ({
            id: connection.snowflakeId,
            type: connection.type,
            value: connection.value,
        }));
    }

    private async getOwnConnections(userId: string) {
        const connections = await UserConnection.find({ userId })
            .sort({ status: 1, verifiedAt: 1, createdAt: 1 })
            .exec();

        return connections.map((connection) => ({
            ...this.mapConnection(connection),
            recordType:
                connection.status === 'pending' ? ('TXT' as const) : undefined,
            recordName:
                connection.status === 'pending'
                    ? connection.verificationRecordName
                    : undefined,
            filePath:
                connection.status === 'pending'
                    ? WEBSITE_VERIFICATION_FILE_PATH
                    : undefined,
            fileUrl:
                connection.status === 'pending'
                    ? getWebsiteVerificationFileUrl(connection.normalizedValue)
                    : undefined,
            expiresAt:
                connection.status === 'pending'
                    ? connection.expiresAt
                    : undefined,
        }));
    }

    private async broadcastProfileConnections(userId: string): Promise<void> {
        const connections = await this.getVerifiedConnections(userId);
        const payload = { userId, connections };

        const user = await this.userRepo.findById(userId);
        const friendships = await this.friendshipRepo.findAllByUserId(userId);

        // Emit to servers (unless the owner hides their connections from non-friends)
        if (user?.privacySettings?.hideConnections !== true) {
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId.toString(), {
                    type: 'user_updated',
                    payload,
                });
            });
        }

        friendships.forEach((friendship) => {
            const friendId =
                friendship.userId.toString() === userId
                    ? friendship.friendId.toString()
                    : friendship.userId.toString();
            this.wsServer.broadcastToUser(friendId, {
                type: 'user_updated',
                payload,
            });
        });

        this.wsServer.broadcastToUser(userId, {
            type: 'user_updated',
            payload,
        });
    }

    private async verifyWebsiteTxtRecord(
        recordName: string,
        tokenHash: string,
    ): Promise<boolean> {
        try {
            const records = await resolveTxtRecordsViaDoh(
                recordName,
                async (url) => {
                    const result = await this.scraperService.fetchText(url);
                    if ('ok' in result && result.ok === false) {
                        throw new Error(result.reason);
                    }
                    return result.body;
                },
            );
            const verified = records.some((record) =>
                isWebsiteVerificationRecord(record, tokenHash),
            );
            return verified;
        } catch {
            return false;
        }
    }

    private async verifyWebsiteHttpsFile(
        normalizedValue: string,
        tokenHash: string,
    ): Promise<boolean> {
        try {
            const fileUrl = getWebsiteVerificationFileUrl(normalizedValue);
            const result = await this.scraperService.fetchText(fileUrl);
            if ('ok' in result && result.ok === false) {
                return false;
            }
            return isWebsiteVerificationFileContent(result.body, tokenHash);
        } catch {
            return false;
        }
    }

    private async mapToProfile(
        user: IUser,
        options: {
            includePermissions?: boolean;
            includeTotp?: boolean;
            viewerId?: string;
            includeActiveMute?: boolean;
        } = {},
    ): Promise<UserProfileResponseDTO> {
        const isOwnProfile = options.viewerId === user.snowflakeId;

        const mapped = mapUser(user, {
            ...options,
            includeSettings: isOwnProfile,
        });
        if (mapped === null) {
            throw new Error('User not found');
        }

        if (user.badges !== undefined && user.badges.length > 0) {
            try {
                const badgeDocs = await Badge.find({ id: { $in: user.badges } })
                    .lean()
                    .exec();
                mapped.badges = badgeDocs.map((doc) => ({
                    id: doc.id,
                    name: doc.name,
                    description: doc.description,
                    icon: doc.icon,
                    color: doc.color,
                    createdAt: doc.createdAt,
                }));
            } catch (error) {
                this.logger.error('Error fetching user badges:', error);
            }
        }

        if (isOwnProfile) {
            mapped.serverSettings = user.serverSettings;
        }

        mapped.connections = isOwnProfile
            ? await this.getOwnConnections(user.snowflakeId)
            : await this.getVerifiedConnections(user.snowflakeId);

        if (
            options.includeActiveMute === true &&
            options.viewerId === user.snowflakeId
        ) {
            await this.muteRepo.checkExpired(user.snowflakeId);
            const activeMute = await this.muteRepo.findActiveByUserId(
                user.snowflakeId,
            );
            (mapped as UserProfileResponseDTO).activeMute =
                activeMute !== null
                    ? {
                          reason: activeMute.reason,
                          expirationTimestamp:
                              activeMute.expirationTimestamp ?? null,
                      }
                    : null;
        }

        (mapped as UserProfileResponseDTO).isPrivate =
            user.privacySettings?.privateProfile ?? false;

        if (isOwnProfile) {
            const ps = user.privacySettings ?? {};
            (mapped as UserProfileResponseDTO).privacySettings = {
                privateProfile: ps.privateProfile ?? false,
                hideDisplayName: ps.hideDisplayName ?? false,
                hidePronouns: ps.hidePronouns ?? false,
                hideConnections: ps.hideConnections ?? false,
                hideBio: ps.hideBio ?? false,
                hideStatus: ps.hideStatus ?? false,
            };
        }

        if (
            options.viewerId !== undefined &&
            options.viewerId !== '' &&
            !isOwnProfile
        ) {
            const profile = mapped as UserProfileResponseDTO;
            const ps = user.privacySettings ?? {};

            const viewerIsFriend = await this.friendshipRepo.areFriends(
                user.snowflakeId,
                options.viewerId,
            );

            // Privacy settings only restrict non-friends; friends see public + private fields
            if (!viewerIsFriend) {
                if (ps.hideDisplayName === true) {
                    profile.displayName = null;
                }
                if (ps.hidePronouns === true) {
                    profile.pronouns = undefined;
                }
                if (ps.hideBio === true) {
                    profile.bio = undefined;
                }
                if (ps.hideStatus === true) {
                    profile.customStatus = null;
                }
                if (ps.hideConnections === true) {
                    profile.connections = [];
                }
            }

            const blockFlags = await this.blockRepo.getActiveBlockFlags(
                user.snowflakeId,
                options.viewerId,
            );

            if ((blockFlags & BlockFlags.HIDE_MY_PRONOUNS) !== 0) {
                profile.pronouns = undefined;
            }
            if ((blockFlags & BlockFlags.HIDE_MY_BIO) !== 0) {
                profile.bio = undefined;
            }
            if ((blockFlags & BlockFlags.HIDE_MY_DISPLAY_NAME) !== 0) {
                profile.displayName = null;
            }
            if ((blockFlags & BlockFlags.HIDE_MY_AVATAR) !== 0) {
                profile.profilePicture = null;
            }
        }

        return mapped;
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, type: UserProfileResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getMyProfile(
        @Req() req: AuthenticatedRequest,
    ): Promise<UserProfileResponseDTO> {
        const userId = req.user.id;
        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        return this.mapToProfile(user, {
            includePermissions: true,
            includeTotp: true,
            includeActiveMute: true,
            viewerId: userId,
        });
    }

    @Post('connections/website')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Create a pending website connection' })
    @ApiResponse({ status: 201, type: CreateWebsiteConnectionResponseDTO })
    public async createWebsiteConnection(
        @Req() req: AuthenticatedRequest,
        @Body() body: CreateWebsiteConnectionRequestDTO,
    ): Promise<CreateWebsiteConnectionResponseDTO> {
        const userId = req.user.id;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change profile connections',
        );
        let website: ReturnType<typeof normalizeWebsite>;
        try {
            website = normalizeWebsite(body.website);
        } catch {
            throw new ApiError(400, 'Invalid website');
        }

        const ownedByAnotherUser = await UserConnection.findOne({
            type: WEBSITE_CONNECTION_TYPE,
            normalizedValue: website.normalizedValue,
            status: 'verified',
            userId: { $ne: userId },
        })
            .lean()
            .exec();
        if (ownedByAnotherUser !== null) {
            throw new ApiError(409, 'Website is already connected');
        }

        const alreadyVerified = await UserConnection.findOne({
            userId: userId,
            type: WEBSITE_CONNECTION_TYPE,
            normalizedValue: website.normalizedValue,
            status: 'verified',
        })
            .lean()
            .exec();
        if (alreadyVerified !== null) {
            throw new ApiError(409, 'Website is already connected');
        }

        const token = createWebsiteVerificationToken();
        const tokenHash = hashWebsiteVerificationToken(token);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const connection = await UserConnection.findOneAndUpdate(
            {
                userId: userId,
                type: WEBSITE_CONNECTION_TYPE,
                normalizedValue: website.normalizedValue,
            },
            {
                $set: {
                    userId: userId,
                    type: WEBSITE_CONNECTION_TYPE,
                    value: website.value,
                    normalizedValue: website.normalizedValue,
                    status: 'pending',
                    verificationTokenHash: tokenHash,
                    verificationRecordName: website.verificationRecordName,
                    expiresAt,
                },
                $unset: { verifiedAt: 1 },
            },
            {
                returnDocument: 'after',
                upsert: true,
                setDefaultsOnInsert: true,
            },
        ).exec();

        return {
            message: 'Please add this TXT to the DNS records of your website.',
            connectionId: connection.snowflakeId,
            recordType: 'TXT',
            recordName: website.verificationRecordName,
            recordValue: `${WEBSITE_VERIFICATION_PREFIX}${token}`,
            filePath: website.verificationFilePath,
            fileUrl: website.verificationFileUrl,
            fileContent: token,
            expiresAt,
        };
    }

    @Post('connections/:connectionId/verify')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Verify a pending website connection' })
    @ApiResponse({
        status: 201,
        type: VerifyConnectionResponseDTO,
        description: 'Website verified',
    })
    public async verifyWebsiteConnection(
        @Req() req: AuthenticatedRequest,
        @Param() params: ConnectionParamDTO,
    ): Promise<{
        message: string;
        connection: { id: string; type: 'Website'; value: string };
    }> {
        const userId = req.user.id;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change profile connections',
        );
        const connection = await UserConnection.findOne({
            snowflakeId: params.connectionId,
            userId: userId,
            type: WEBSITE_CONNECTION_TYPE,
        }).exec();

        if (connection === null) {
            throw new ApiError(404, 'Connection not found');
        }

        if (connection.status !== 'pending') {
            return {
                message: 'Website is already verified',
                connection: {
                    id: connection.snowflakeId,
                    type: connection.type,
                    value: connection.value,
                },
            };
        }

        if (
            connection.expiresAt !== undefined &&
            connection.expiresAt.getTime() < Date.now()
        ) {
            throw new ApiError(400, WEBSITE_VERIFICATION_FAILURE);
        }

        const tokenHash = connection.verificationTokenHash;
        const recordName = connection.verificationRecordName;
        if (tokenHash === undefined || recordName === undefined) {
            throw new ApiError(400, WEBSITE_VERIFICATION_FAILURE);
        }

        const [hasTxtVerificationRecord, hasHttpsVerificationFile] =
            await Promise.all([
                this.verifyWebsiteTxtRecord(recordName, tokenHash),
                this.verifyWebsiteHttpsFile(
                    connection.normalizedValue,
                    tokenHash,
                ),
            ]);

        if (!hasTxtVerificationRecord && !hasHttpsVerificationFile) {
            throw new ApiError(400, WEBSITE_VERIFICATION_FAILURE);
        }

        connection.status = 'verified';
        connection.verificationTokenHash = undefined;
        connection.verificationRecordName = undefined;
        connection.expiresAt = undefined;
        connection.verifiedAt = new Date();
        try {
            await connection.save();
        } catch {
            throw new ApiError(409, 'Website is already connected');
        }

        try {
            await this.broadcastProfileConnections(userId);
        } catch (err) {
            this.logger.error('Failed to emit connection update:', err);
        }

        return {
            message: 'Website verified successfully',
            connection: {
                id: connection.snowflakeId,
                type: connection.type,
                value: connection.value,
            },
        };
    }

    @Delete('connections/:connectionId')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Remove a profile connection' })
    @ApiOkResponse({
        type: SimpleMessageResponseDTO,
        description: 'Connection removed',
    })
    public async removeConnection(
        @Req() req: AuthenticatedRequest,
        @Param() params: ConnectionParamDTO,
    ): Promise<{ message: string }> {
        const userId = req.user.id;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change profile connections',
        );
        const deleted = await UserConnection.findOneAndDelete({
            snowflakeId: params.connectionId,
            userId: userId,
        }).exec();

        if (deleted === null) {
            throw new ApiError(404, 'Connection not found');
        }

        try {
            await this.broadcastProfileConnections(userId);
        } catch (err) {
            this.logger.error('Failed to emit connection removal:', err);
        }

        return { message: 'Connection removed successfully' };
    }

    @Get(':userId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get user profile by ID' })
    @ApiResponse({ status: 200, type: UserProfileResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getUserProfileResponseDTO(
        @Param('userId') userId: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<UserProfileResponseDTO> {
        const viewer = req.user;
        const viewerId = viewer.id;
        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (viewer.isBot === true && viewerId !== userId) {
            const bot = await Bot.findOne({ userId: viewerId }).lean();
            if (bot === null || bot.botPermissions.readUsers !== true) {
                throw new ApiError(
                    403,
                    'Bot does not have readUsers permission',
                );
            }

            const botServerIds =
                await this.serverMemberRepo.findServerIdsByUserId(viewerId);
            const userServerIds =
                await this.serverMemberRepo.findServerIdsByUserId(
                    user.snowflakeId,
                );

            const hasSharedServer = botServerIds.some((botSid) =>
                userServerIds.some(
                    (userSid) => userSid.toString() === botSid.toString(),
                ),
            );

            if (hasSharedServer !== true) {
                throw new ApiError(
                    403,
                    'Bots can only view profiles of users they share a server with',
                );
            }
        }

        return this.mapToProfile(user, { viewerId });
    }

    @Post(':id/badges')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update user badges' })
    @ApiResponse({ status: 200, type: BadgeOperationResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid badge IDs' })
    @ApiResponse({ status: 403, description: 'Insufficient permissions' })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async updateUserBadges(
        @Param('id') id: string,
        @Body() request: AssignBadgesRequestDTO,
        @Req() req: AuthenticatedRequest,
    ): Promise<BadgeOperationResponseDTO> {
        const adminUser = req.user;
        try {
            if (hasPermission(adminUser, 'manageUsers') !== true) {
                throw new ApiError(
                    403,
                    ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
                );
            }

            const user = await this.userRepo.findById(id);
            if (user === null) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            if (request.badgeIds.length === 0) {
                await this.userRepo.update(user.snowflakeId, { badges: [] });

                this.wsServer.broadcastToUser(user.snowflakeId, {
                    type: 'user_updated',
                    payload: {
                        userId: user.snowflakeId,
                        badges: [],
                    },
                });

                return {
                    message: 'All badges removed successfully',
                    badges: [],
                };
            }

            const validBadges = await Badge.find({
                id: { $in: request.badgeIds },
            })
                .lean()
                .exec();

            const validBadgeIds = validBadges.map((b) => b.id);
            const invalidBadgeIds = request.badgeIds.filter(
                (badgeId: string) => !validBadgeIds.includes(badgeId),
            );

            if (invalidBadgeIds.length > 0) {
                throw new ApiError(
                    400,
                    `Invalid badge IDs: ${invalidBadgeIds.join(', ')}`,
                );
            }

            await this.userRepo.update(user.snowflakeId, {
                badges: validBadgeIds,
            });

            this.wsServer.broadcastToUser(user.snowflakeId, {
                type: 'user_updated',
                payload: {
                    userId: user.snowflakeId,
                    badges: validBadgeIds,
                },
            });

            this.logger.info(
                `User ${adminUser.id} updated badges for user ${user.snowflakeId}`,
                {
                    targetUserId: user.snowflakeId,
                    badgeCount: validBadgeIds.length,
                    adminUserId: adminUser.id,
                },
            );

            const badgeResponse = validBadges.map((badge) => ({
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon,
                color: badge.color,
                createdAt: badge.createdAt,
            }));

            return {
                message: 'Badges updated successfully',
                badges: badgeResponse,
            };
        } catch (error) {
            this.logger.error('Error updating user badges:', error);
            throw error;
        }
    }

    @Post('picture')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('profilePicture', {
            storage,
            fileFilter: imageFileFilter,
            limits: imageUploadLimits,
        }),
    )
    @ApiConsumes('multipart/form-data')
    @NoBot()
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                profilePicture: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @HttpCode(200)
    @ApiOperation({ summary: 'Upload profile picture' })
    @ApiResponse({ status: 201, type: UpdateProfilePictureResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid file or dimensions' })
    public async uploadProfilePicture(
        @UploadedFile() profilePicture: Express.Multer.File | undefined,
        @Req() req: AuthenticatedRequest,
    ): Promise<UpdateProfilePictureResponseDTO> {
        try {
            const userPayload = req.user;
            const userId = userPayload.id;
            await assertHttpNotMuted(
                this.muteRepo,
                userId,
                'change your profile picture',
            );

            if (profilePicture === undefined) {
                throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
            }

            // Allow profile pictures up to 5MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (profilePicture.size > MAX_SIZE) {
                const sizeMB = (profilePicture.size / (1024 * 1024)).toFixed(2);
                throw new ApiError(
                    400,
                    `File size too large (${sizeMB}MB). Max 5MB allowed.`,
                );
            }

            const user = await this.userRepo.findById(userId);
            if (user === null) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            // Remove old profile picture
            if (
                user.profilePicture !== undefined &&
                user.profilePicture !== ''
            ) {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'profiles',
                    path.basename(user.profilePicture),
                );
                if (fs.existsSync(oldPath) === true) {
                    fs.unlinkSync(oldPath);
                }
            }

            const profilesDir = path.join(process.cwd(), 'uploads', 'profiles');
            if (fs.existsSync(profilesDir) === false) {
                fs.mkdirSync(profilesDir, { recursive: true });
            }

            const uploadedPath = profilePicture.path;

            // Validate dimensions and format
            let metadata;
            try {
                metadata = await getImageMetadata(uploadedPath);

                if (metadata.width === 0 || metadata.height === 0) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(400, 'Could not read image dimensions');
                }

                if (metadata.width > 256 || metadata.height > 256) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        `Profile picture dimensions must be at most 256x256px. Received: ${metadata.width}x${metadata.height}px`,
                    );
                }

                // Check if the profile picture is webp or gif
                if (metadata.format !== 'webp' && metadata.format !== 'gif') {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        'Invalid file format. Only WebP and GIF are allowed.',
                    );
                }
            } catch (validationErr: unknown) {
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
                const error = validationErr as Error;
                this.logger.error('Profile picture validation error:', error);
                throw new ApiError(
                    400,
                    error.message || 'Failed to validate profile picture image',
                );
            }

            const isAnimated: boolean =
                metadata.pages !== undefined && metadata.pages > 1;
            const format =
                metadata.format === 'gif'
                    ? 'gif'
                    : isAnimated
                      ? 'webp'
                      : 'webp';
            const ext = `.${format}`;
            const filename = `${randomBytes(16).toString('hex')}${ext}`;
            const targetPath = path.join(profilesDir, filename);

            try {
                await processAndSaveImage(
                    uploadedPath,
                    targetPath,
                    ImagePresets.profilePicture(format, isAnimated),
                );

                // Delete temp upload
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
            } catch (processErr) {
                this.logger.error(
                    'Profile picture processing error:',
                    processErr,
                );
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
                throw new ApiError(500, 'Failed to process profile picture');
            }

            await this.userRepo.updateProfilePicture(userId, filename);

            const profilePictureUrl = `/api/v1/profile/picture/${filename}`;

            try {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                const friendships =
                    await this.friendshipRepo.findAllByUserId(userId);

                const updatePayload = {
                    userId,
                    profilePicture: profilePictureUrl,
                };

                // Emit to all servers the user is in
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'user_updated',
                        payload: updatePayload,
                    });
                });

                // Emit to all friends
                friendships.forEach((friendship) => {
                    const friendId =
                        friendship.userId.toString() === userId
                            ? friendship.friendId.toString()
                            : friendship.userId.toString();
                    this.wsServer.broadcastToUser(friendId, {
                        type: 'user_updated',
                        payload: updatePayload,
                    });
                });

                // Also emit to the user themselves (for other sessions)
                this.wsServer.broadcastToUser(userId, {
                    type: 'user_updated',
                    payload: updatePayload,
                });
            } catch (err) {
                this.logger.error(
                    'Failed to emit profile picture update:',
                    err,
                );
            }

            return {
                message: 'Profile picture updated successfully',
                profilePicture: profilePictureUrl,
            };
        } catch (err: unknown) {
            this.logger.error('Profile picture upload error:', err);
            throw err;
        }
    }

    @Post('banner')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('banner', {
            storage,
            fileFilter: imageFileFilter,
            limits: imageUploadLimits,
        }),
    )
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
    @HttpCode(200)
    @ApiOperation({ summary: 'Upload profile banner' })
    @ApiResponse({ status: 201, type: UpdateBannerResponseDTO })
    @ApiResponse({ status: 400, description: 'Invalid file or dimensions' })
    public async uploadBanner(
        @UploadedFile() banner: Express.Multer.File | undefined,
        @Req() req: AuthenticatedRequest,
    ): Promise<UpdateBannerResponseDTO> {
        try {
            const userPayload = req.user;
            const username = userPayload.username;
            const userId = userPayload.id;
            await assertHttpNotMuted(
                this.muteRepo,
                userId,
                'change your profile banner',
            );

            if (banner === undefined) {
                throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
            }

            // Allow banners up to 5MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (banner.size > MAX_SIZE) {
                const sizeMB = (banner.size / (1024 * 1024)).toFixed(2);
                throw new ApiError(
                    400,
                    `File size too large (${sizeMB}MB). Max 5MB allowed.`,
                );
            }

            const user = await this.userRepo.findById(userId);
            if (user === null) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            // Remove old banner to save storage
            if (user.banner !== undefined && user.banner !== '') {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'banners',
                    path.basename(user.banner),
                );
                if (fs.existsSync(oldPath) === true) {
                    fs.unlinkSync(oldPath);
                }
            }

            const bannersDir = path.join(process.cwd(), 'uploads', 'banners');
            if (fs.existsSync(bannersDir) === false) {
                fs.mkdirSync(bannersDir, { recursive: true });
            }

            const uploadedPath = banner.path;

            let metadata;
            try {
                metadata = await getImageMetadata(uploadedPath);

                if (metadata.width === 0 || metadata.height === 0) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(400, 'Could not read image dimensions');
                }

                if (metadata.width > 1136 || metadata.height > 400) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        `Banner dimensions must be at most 1136x400px. Received: ${metadata.width}x${metadata.height}px`,
                    );
                }

                // Check if the banner is webp or gif
                if (metadata.format !== 'webp' && metadata.format !== 'gif') {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        'Invalid file format. Only WebP and GIF are allowed.',
                    );
                }
            } catch (validationErr: unknown) {
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
                const error = validationErr as Error;
                this.logger.error('Banner validation error:', error);
                throw new ApiError(
                    400,
                    error.message || 'Failed to validate banner image',
                );
            }

            const isAnimated: boolean =
                metadata.pages !== undefined && metadata.pages > 1;
            const format =
                metadata.format === 'gif'
                    ? 'gif'
                    : isAnimated
                      ? 'webp'
                      : 'webp';
            const ext = `.${format}`;
            const filename = `${randomBytes(16).toString('hex')}${ext}`;
            const targetPath = path.join(bannersDir, filename);

            try {
                await processAndSaveImage(
                    uploadedPath,
                    targetPath,
                    ImagePresets.profileBanner(format, isAnimated),
                );

                // Delete temp upload
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
            } catch (processErr) {
                this.logger.error('Banner processing error:', processErr);
                if (fs.existsSync(uploadedPath) === true) {
                    fs.unlinkSync(uploadedPath);
                }
                throw new ApiError(500, 'Failed to process banner');
            }

            await this.userRepo.updateBanner(userId, filename);

            const bannerUrl = `/api/v1/profile/banner/${filename}`;

            try {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                const friendships =
                    await this.friendshipRepo.findAllByUserId(userId);

                const updatePayload = {
                    username,
                    banner: bannerUrl,
                };

                // Emit to all servers the user is in
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'user_banner_updated',
                        payload: updatePayload,
                    });
                });

                // Emit to all friends
                friendships.forEach((friendship) => {
                    const friendId =
                        friendship.userId.toString() === userId
                            ? friendship.friendId.toString()
                            : friendship.userId.toString();
                    this.wsServer.broadcastToUser(friendId, {
                        type: 'user_banner_updated',
                        payload: updatePayload,
                    });
                });

                // Also emit to the user themselves (for other sessions)
                this.wsServer.broadcastToUser(userId, {
                    type: 'user_banner_updated',
                    payload: updatePayload,
                });
            } catch (err) {
                this.logger.error('Failed to emit banner update:', err);
            }

            return {
                message: 'Profile banner updated successfully',
                banner: bannerUrl,
            };
        } catch (err: unknown) {
            this.logger.error('Banner upload error:', err);
            throw err;
        }
    }

    @Get('banner/:filename')
    @ApiOperation({ summary: 'Get profile banner' })
    @ApiProduces('image/webp', 'image/gif', 'image/png', 'image/jpeg')
    @ApiOkResponse({ type: String, description: 'Banner image' })
    @ApiResponse({ status: 400, description: 'Invalid filename' })
    @ApiResponse({ status: 404, description: 'Banner not found' })
    public async getBanner(
        @Param() params: FilenameParamDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const { filename } = params;

        const filePath = path.join(
            process.cwd(),
            'uploads',
            'banners',
            filename,
        );

        if (!fs.existsSync(filePath)) {
            res.status(404).send({ error: 'Banner not found' });
            return;
        }

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filePath,
                req.headers.accept,
            );

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        res.send(buffer);
    }

    @Patch('bio')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update bio' })
    @ApiOkResponse({ type: UpdateBioResponseDTO, description: 'Bio updated' })
    public async updateBio(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateBioRequestDTO,
    ): Promise<{ message: string; bio: string }> {
        const userId = req.user.id;
        await assertHttpNotMuted(this.muteRepo, userId, 'change your bio');
        const { bio } = body;

        const updatedUser = await this.userRepo.update(userId, {
            bio: bio !== '' ? bio : '',
        });

        try {
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                bio: bio !== '' ? bio : '',
            };

            // Emit to servers (unless the owner hides their bio from non-friends)
            if (updatedUser?.privacySettings?.hideBio !== true) {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'user_updated',
                        payload,
                    });
                });
            }

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to self
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit bio update:', err);
        }

        return {
            message: 'Bio updated successfully',
            bio: bio !== '' ? bio : '',
        };
    }

    @Patch('pronouns')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @NoBot()
    @ApiOperation({ summary: 'Update pronouns' })
    @ApiOkResponse({
        type: UpdatePronounsResponseDTO,
        description: 'Pronouns updated',
    })
    public async updatePronouns(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdatePronounsRequestDTO,
    ): Promise<{ message: string; pronouns: string }> {
        const userId = req.user.id;
        await assertHttpNotMuted(this.muteRepo, userId, 'change your pronouns');
        const { pronouns } = body;

        const updatedUser = await this.userRepo.update(userId, {
            pronouns: pronouns !== '' ? pronouns : '',
        });

        try {
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                pronouns: pronouns !== '' ? pronouns : '',
            };

            // Emit to servers (unless the owner hides their pronouns from non-friends)
            if (updatedUser?.privacySettings?.hidePronouns !== true) {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'user_updated',
                        payload,
                    });
                });
            }

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to self
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit pronouns update:', err);
        }

        return {
            message: 'Pronouns updated successfully',
            pronouns: pronouns !== '' ? pronouns : '',
        };
    }

    @Patch('display-name')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @NoBot()
    @ApiOperation({ summary: 'Update display name' })
    @ApiOkResponse({
        type: UpdateDisplayNameResponseDTO,
        description: 'Display name updated',
    })
    @ApiResponse({ status: 400, description: 'Invalid display name' })
    public async updateDisplayName(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateDisplayNameRequestDTO,
    ): Promise<{ message: string; displayName: string | null }> {
        const userPayload = req.user;
        const userId = userPayload.id;
        const username = userPayload.username;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change your display name',
        );
        const { displayName } = body;

        await this.userRepo.updateDisplayName(userId, displayName || null);

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                username,
                displayName:
                    updatedUser !== null
                        ? (updatedUser.displayName ?? null)
                        : null,
            };

            // Emit to servers (unless the owner hides their display name from non-friends)
            if (updatedUser?.privacySettings?.hideDisplayName !== true) {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'display_name_updated',
                        payload,
                    });
                });
            }

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'display_name_updated',
                    payload,
                });
            });

            // Emit to self
            this.wsServer.broadcastToUser(userId, {
                type: 'display_name_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit display name update:', err);
        }

        return {
            message: 'Display name updated successfully',
            displayName:
                updatedUser !== null ? (updatedUser.displayName ?? null) : null,
        };
    }

    @Patch('privacy')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update privacy settings' })
    @ApiOkResponse({ description: 'Privacy settings updated' })
    public async updatePrivacySettings(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdatePrivacySettingsRequestDTO,
    ): Promise<{ message: string; privacySettings: PrivacySettingsDTO }> {
        const userId = req.user.id;

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const current = user.privacySettings ?? {};
        const updated = {
            privateProfile:
                body.privateProfile ?? current.privateProfile ?? false,
            hideDisplayName:
                body.hideDisplayName ?? current.hideDisplayName ?? false,
            hidePronouns: body.hidePronouns ?? current.hidePronouns ?? false,
            hideConnections:
                body.hideConnections ?? current.hideConnections ?? false,
            hideBio: body.hideBio ?? current.hideBio ?? false,
            hideStatus: body.hideStatus ?? current.hideStatus ?? false,
        };

        await this.userRepo.update(userId, { privacySettings: updated });

        return {
            message: 'Privacy settings updated successfully',
            privacySettings: updated,
        };
    }

    @Patch('status')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update custom status' })
    @ApiOkResponse({
        type: UpdateCustomStatusResponseDTO,
        description: 'Status updated',
    })
    @ApiResponse({ status: 400, description: 'Invalid status' })
    public async updateCustomStatus(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateStatusRequestDTO,
    ): Promise<{ customStatus: SerializedCustomStatus | null }> {
        const userPayload = req.user;
        const userId = userPayload.id;
        const username = userPayload.username;
        await assertHttpNotMuted(this.muteRepo, userId, 'change your status');
        const { text, emoji, expiresAt, expiresInMinutes, clear } = body;

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (
            clear === true ||
            ((text === undefined || String(text).trim().length === 0) &&
                (emoji === undefined || String(emoji).trim().length === 0))
        ) {
            await this.userRepo.updateCustomStatus(userId, null);

            try {
                // Broadcast status clear to friends and server members
                const friendships =
                    await this.friendshipRepo.findAllByUserId(userId);

                const payload = { username, status: null };

                // Emit to servers (unless the owner hides their status from non-friends)
                if (user.privacySettings?.hideStatus !== true) {
                    const serverIds =
                        await this.serverMemberRepo.findServerIdsByUserId(
                            userId,
                        );
                    serverIds.forEach((serverId) => {
                        this.wsServer.broadcastToServer(serverId.toString(), {
                            type: 'status_update',
                            payload,
                        });
                    });
                }

                // Emit to friends
                friendships.forEach((friendship) => {
                    const friendId =
                        friendship.userId.toString() === userId
                            ? friendship.friendId.toString()
                            : friendship.userId.toString();
                    this.wsServer.broadcastToUser(friendId, {
                        type: 'status_update',
                        payload,
                    });
                });
            } catch (err) {
                this.logger.error('Failed to publish status clear:', err);
            }

            return { customStatus: null };
        }

        let expiresAtDate: Date | null = null;
        if (expiresAt === null) {
            expiresAtDate = null;
        } else if (
            typeof expiresAt === 'string' &&
            expiresAt.trim().length > 0
        ) {
            const parsed = new Date(expiresAt);
            if (Number.isNaN(parsed.getTime())) {
                throw new ApiError(
                    400,
                    ErrorMessages.PROFILE.INVALID_EXPIRES_AT,
                );
            }
            expiresAtDate = parsed;
        } else if (
            typeof expiresInMinutes === 'number' &&
            expiresInMinutes > 0
        ) {
            expiresAtDate = new Date(Date.now() + expiresInMinutes * 60_000);
        } else {
            expiresAtDate = null;
        }

        const newStatus: {
            text: string;
            expiresAt: Date | null;
            updatedAt: Date;
            emoji?: string;
        } = {
            text: text ?? '',
            expiresAt: expiresAtDate,
            updatedAt: new Date(),
        };

        if (emoji !== undefined && emoji !== '') {
            newStatus.emoji = emoji;
        }

        await this.userRepo.updateCustomStatus(userId, newStatus);

        const updatedUser = await this.userRepo.findById(userId);
        const serialized =
            updatedUser !== null
                ? resolveSerializedCustomStatus(updatedUser.customStatus)
                : null;

        try {
            // Broadcast status update to friends and server members
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = { username, status: serialized };

            // Emit to servers (unless the owner hides their status from non-friends)
            if (updatedUser?.privacySettings?.hideStatus !== true) {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'status_update',
                        payload,
                    });
                });
            }

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'status_update',
                    payload,
                });
            });
        } catch (err) {
            this.logger.error('Failed to publish custom status update:', err);
        }

        return { customStatus: serialized };
    }

    @Delete('status')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Clear custom status' })
    @ApiOkResponse({
        type: UpdateCustomStatusResponseDTO,
        description: 'Status cleared',
    })
    public async clearCustomStatus(
        @Req() req: AuthenticatedRequest,
    ): Promise<{ customStatus: null }> {
        const userPayload = req.user;
        const userId = userPayload.id;
        const username = userPayload.username;
        await assertHttpNotMuted(this.muteRepo, userId, 'change your status');

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.userRepo.updateCustomStatus(userId, null);

        try {
            // Broadcast status clear to friends and server members
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = { username, status: null };

            // Emit to servers (unless the owner hides their status from non-friends)
            if (user.privacySettings?.hideStatus !== true) {
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId.toString(), {
                        type: 'status_update',
                        payload,
                    });
                });
            }

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'status_update',
                    payload,
                });
            });
        } catch (err) {
            this.logger.error('Failed to publish status clear:', err);
        }

        return { customStatus: null };
    }

    @Post('status/bulk')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get bulk custom statuses' })
    @ApiOkResponse({
        type: BulkStatusesResponseDTO,
        description: 'Bulk statuses',
    })
    @ApiBody({ type: BulkStatusRequestDTO })
    public async getBulkStatuses(
        @Body() body: BulkStatusRequestDTO,
        @Req() req: AuthenticatedRequest,
    ): Promise<{ statuses: Record<string, SerializedCustomStatus | null> }> {
        const viewerId = req.user.id;
        const { usernames } = body;

        if (Array.isArray(usernames) === false) {
            throw new ApiError(
                400,
                ErrorMessages.PROFILE.USERNAMES_ARRAY_REQUIRED,
            );
        }

        const sanitized = Array.from(
            new Set(
                usernames
                    .map((name) =>
                        typeof name === 'string' ? name.trim() : '',
                    )
                    .filter((name) => name.length > 0),
            ),
        ).slice(0, 200);

        if (sanitized.length === 0) {
            return { statuses: {} };
        }

        const users = await this.userRepo.findByUsernames(sanitized);
        const friendships = await this.friendshipRepo.findByUserId(viewerId);
        const friendIds = new Set(
            friendships.map((f) =>
                f.userId.toString() === viewerId
                    ? f.friendId.toString()
                    : f.userId.toString(),
            ),
        );
        const statuses: Record<string, SerializedCustomStatus | null> = {};

        for (const name of sanitized) {
            statuses[name] = null;
        }

        for (const user of users) {
            if (user.username === undefined) continue;

            const isFriend = friendIds.has(user.snowflakeId);
            const hiddenFromViewer =
                user.privacySettings?.hideStatus === true &&
                user.snowflakeId !== viewerId &&
                !isFriend;

            statuses[user.username] = hiddenFromViewer
                ? null
                : resolveSerializedCustomStatus(user.customStatus);
        }

        return { statuses };
    }

    @Patch('style')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update username style' })
    @ApiOkResponse({
        type: UpdateStyleResponseDTO,
        description: 'Style updated',
    })
    public async updateUsernameStyle(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateStyleRequestDTO,
    ): Promise<{
        message: string;
        usernameFont?: string;
        usernameGradient?: {
            enabled: boolean;
            colors: string[];
            angle: number;
        };
        usernameGlow?: {
            enabled: boolean;
            color: string;
            intensity: number;
        };
    }> {
        const userPayload = req.user;
        const userId = userPayload.id;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change your profile style',
        );

        const { usernameFont, usernameGradient, usernameGlow } = body;

        await this.userRepo.updateUsernameStyle(userId, {
            usernameFont,
            usernameGradient,
            usernameGlow,
        });

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                usernameFont: updatedUser?.usernameFont,
                usernameGradient: updatedUser?.usernameGradient,
                usernameGlow: updatedUser?.usernameGlow,
            };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId.toString(), {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to self
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit username style update:', err);
        }

        return {
            message: 'Username style updated successfully',
            usernameFont: updatedUser?.usernameFont,
            usernameGradient: updatedUser?.usernameGradient,
            usernameGlow: updatedUser?.usernameGlow,
        };
    }

    @Patch('appearance')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update profile appearance colors' })
    @ApiOkResponse({
        type: UpdateAppearanceResponseDTO,
        description: 'Appearance updated',
    })
    public async updateAppearance(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateAppearanceRequestDTO,
    ): Promise<UpdateAppearanceResponseDTO> {
        const userId = req.user.id;
        await assertHttpNotMuted(
            this.muteRepo,
            userId,
            'change your profile appearance',
        );

        const update: {
            profilePrimaryColor?: string | null;
            profileAccentColor?: string | null;
        } = {};
        if (body.profilePrimaryColor !== undefined)
            update.profilePrimaryColor = body.profilePrimaryColor ?? null;
        if (body.profileAccentColor !== undefined)
            update.profileAccentColor = body.profileAccentColor ?? null;

        if (Object.keys(update).length > 0) {
            const currentUser = await this.userRepo.findById(userId);
            const resultingPrimary =
                update.profilePrimaryColor !== undefined
                    ? update.profilePrimaryColor
                    : currentUser?.profilePrimaryColor;
            const resultingAccent =
                update.profileAccentColor !== undefined
                    ? update.profileAccentColor
                    : currentUser?.profileAccentColor;

            if (
                resultingAccent != null &&
                resultingAccent !== '' &&
                (resultingPrimary == null || resultingPrimary === '')
            ) {
                throw new ApiError(
                    400,
                    'Accent color requires a primary color to be set',
                );
            }

            await this.userRepo.update(userId, update);
        }

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                profilePrimaryColor: updatedUser?.profilePrimaryColor ?? null,
                profileAccentColor: updatedUser?.profileAccentColor ?? null,
            };

            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId.toString(), {
                    type: 'user_updated',
                    payload,
                });
            });

            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'user_updated',
                    payload,
                });
            });

            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit appearance update:', err);
        }

        return {
            message: 'Profile appearance updated successfully',
            profilePrimaryColor: updatedUser?.profilePrimaryColor ?? null,
            profileAccentColor: updatedUser?.profileAccentColor ?? null,
        };
    }

    @Get('lookup/:username')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Lookup user by username' })
    @ApiResponse({ status: 200, type: UserLookupResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async lookupUserByUsername(
        @Param('username') username: string,
    ): Promise<UserLookupResponseDTO> {
        const user = await this.userRepo.findByUsername(username);

        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        return { id: user.snowflakeId };
    }

    @Post('bulk')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Lookup multiple user profiles by ID' })
    @ApiResponse({ status: 200, type: [UserProfileResponseDTO] })
    public async bulkLookupUsers(
        @Body() body: { ids: string[] },
        @Req() req: AuthenticatedRequest,
    ): Promise<UserProfileResponseDTO[]> {
        const viewerId = req.user.id;
        const users = await this.userRepo.findByIds(body.ids);

        const profiles = await Promise.all(
            users.map((user) => this.mapToProfile(user, { viewerId })),
        );

        return profiles;
    }

    @Patch('username')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Change username' })
    @ApiOkResponse({
        type: ChangeUsernameResponseDTO,
        description: 'Username changed',
    })
    @ApiResponse({ status: 409, description: 'Username taken' })
    public async changeUsername(
        @Req() req: AuthenticatedRequest,
        @Body() body: ChangeUsernameRequestDTO,
    ): Promise<{ message: string; username: string }> {
        const userPayload = req.user;
        const userId = userPayload.id;
        await assertHttpNotMuted(this.muteRepo, userId, 'change your username');
        const { newUsername } = body;

        const existingUser = await this.userRepo.findByUsername(newUsername);
        if (existingUser !== null) {
            throw new ApiError(409, ErrorMessages.PROFILE.USERNAME_TAKEN);
        }

        const user = await this.userRepo.findById(userId);
        if (user === null) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const oldUsername = user.username ?? '';

        await this.userRepo.updateUsername(userId, newUsername);

        // Emit socket event
        try {
            const updatedUser = await this.userRepo.findById(userId);
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                oldUsername,
                newUsername,
                profilePicture:
                    updatedUser !== null &&
                    updatedUser.profilePicture !== undefined &&
                    updatedUser.profilePicture !== ''
                        ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                        : null,
                usernameFont: updatedUser?.usernameFont,
                usernameGradient: updatedUser?.usernameGradient,
                usernameGlow: updatedUser?.usernameGlow,
            };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId.toString(), {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to friends
            friendships.forEach((friendship) => {
                const friendId =
                    friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                this.wsServer.broadcastToUser(friendId, {
                    type: 'user_updated',
                    payload,
                });
            });

            // Emit to self
            this.wsServer.broadcastToUser(userId, {
                type: 'user_updated',
                payload,
            });
        } catch (err) {
            this.logger.error('Failed to emit username change:', err);
        }

        return {
            message: 'Username changed successfully',
            username: newUsername,
        };
    }

    @Patch('language')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @NoBot()
    @ApiOperation({ summary: 'Update language' })
    @ApiOkResponse({
        type: UpdateLanguageResponseDTO,
        description: 'Language updated',
    })
    public async updateLanguage(
        @Req() req: AuthenticatedRequest,
        @Body() body: UpdateLanguageRequestDTO,
    ): Promise<{ message: string; language: string }> {
        const username = req.user.username;
        const { language } = body;

        if (language === '') {
            throw new ApiError(400, 'Language is required');
        }

        const user = await this.userRepo.findByUsername(username);
        if (user === null) {
            throw new ApiError(404, 'User not found');
        }

        await this.userRepo.updateLanguage(user.snowflakeId, language);

        return {
            message: 'Language preference updated successfully',
            language,
        };
    }

    @Get('picture/:filename')
    @ApiOperation({ summary: 'Get profile picture' })
    @ApiProduces('image/webp', 'image/gif', 'image/png', 'image/jpeg')
    @ApiOkResponse({ type: String, description: 'Profile picture' })
    @ApiResponse({ status: 400, description: 'Invalid filename' })
    @ApiResponse({ status: 404, description: 'Image not found' })
    public async getProfilePicture(
        @Param() params: FilenameParamDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const { filename } = params;

        if (filename === '') {
            res.status(400).send({ error: 'Filename required' });
            return;
        }

        const safeFilename = path.basename(filename);
        const profilesDir = path.join(process.cwd(), 'uploads', 'profiles');
        const filePath = path.join(profilesDir, safeFilename);

        const resolvedPath = path.resolve(filePath);
        const resolvedProfilesDir = path.resolve(profilesDir);

        if (!resolvedPath.startsWith(resolvedProfilesDir)) {
            res.status(400).send({ error: 'Invalid filename' });
            return;
        }

        if (fs.existsSync(filePath) === false) {
            res.status(404).send({ error: 'Profile picture not found' });
            return;
        }

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filePath,
                req.headers.accept,
            );

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

        res.send(buffer);
    }
}
