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
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { Request, Response } from 'express';
import {
    UserProfileResponseDTO,
    UserLookupResponseDTO,
    UpdateProfilePictureResponseDTO,
    UpdateBannerResponseDTO,
    BadgeOperationResponseDTO,
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
} from './dto/profile.request.dto';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JWTPayload, hasPermission } from '@/utils/jwt';
import { mapUser } from '@/utils/user';
import {
    resolveSerializedCustomStatus,
    SerializedCustomStatus,
} from '@/utils/status';

import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import { IUserRepository, IUser } from '@/di/interfaces/IUserRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { ILogger } from '@/di/interfaces/ILogger';

import { Badge } from '@/models/Badge';
import { storage } from '@/config/multer';
import type { WsServer } from '@/ws/server';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

@ApiTags('Profile')
@injectable()
@Controller('api/v1/profile')
export class ProfileController {
    constructor(
        @inject(TYPES.UserRepository)
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.FriendshipRepository)
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
    ) { }

    // Maps a user document to a public UserProfileResponseDTO payload
    private async mapToProfile(user: IUser): Promise<UserProfileResponseDTO> {
        const mapped = mapUser(user);
        if (!mapped) {
            throw new Error('User not found');
        }

        if (
            user.badges &&
            Array.isArray(user.badges) &&
            user.badges.length > 0
        ) {
            try {
                const badgeDocs = await Badge.find({ id: { $in: user.badges } })
                    .lean()
                    .exec();
                // @ts-ignore - badges type mismatch in mapUser vs DTO but compatible at runtime
                mapped.badges = badgeDocs.map((doc) => ({
                    _id: doc._id,
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

        // @ts-ignore
        mapped.banner = user.banner
            ? `/api/v1/profile/banner/${user.banner}`
            : null;

        return mapped as unknown as UserProfileResponseDTO;
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, type: UserProfileResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getMyProfile(
        @Req() req: Request,
    ): Promise<UserProfileResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }
        return this.mapToProfile(user);
    }

    @Get(':userId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get user profile by ID' })
    @ApiResponse({ status: 200, type: UserProfileResponseDTO })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getUserProfileResponseDTO(
        @Param('userId') userId: string,
    ): Promise<UserProfileResponseDTO> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        return this.mapToProfile(user);
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
        @Req() req: Request,
    ): Promise<BadgeOperationResponseDTO> {
        const adminUser = (req as unknown as RequestWithUser).user;
        try {
            if (!adminUser) {
                throw new ApiError(401, ErrorMessages.AUTH.UNAUTHORIZED);
            }

            if (!hasPermission(adminUser, 'manageUsers')) {
                throw new ApiError(
                    403,
                    ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
                );
            }

            const user = await this.userRepo.findById(id);
            if (!user) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            if (request.badgeIds.length === 0) {
                await this.userRepo.update(user._id.toString(), { badges: [] });

                this.wsServer.broadcastToUser(user._id.toString(), {
                    type: 'user_updated',
                    payload: {
                        userId: user._id.toString(),
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

            await this.userRepo.update(user._id.toString(), {
                badges: validBadgeIds,
            });

            this.wsServer.broadcastToUser(user._id.toString(), {
                type: 'user_updated',
                payload: {
                    userId: user._id.toString(),
                    badges: validBadgeIds,
                },
            });

            this.logger.info(
                `User ${adminUser.id} updated badges for user ${user._id}`,
                {
                    targetUserId: user._id,
                    badgeCount: validBadgeIds.length,
                    adminUserId: adminUser.id,
                },
            );

            const badgeResponse = validBadges.map((badge) => ({
                _id: badge._id,
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
    @UseInterceptors(FileInterceptor('profilePicture', { storage }))
    @ApiConsumes('multipart/form-data')
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
        @UploadedFile() profilePicture: Express.Multer.File,
        @Req() req: Request,
    ): Promise<UpdateProfilePictureResponseDTO> {
        try {
            const userPayload = (req as unknown as RequestWithUser).user;
            const userId = userPayload.id;

            if (!profilePicture) {
                throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
            }

            // Allow profile pictures up to 5MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (profilePicture.size > MAX_SIZE) {
                throw new ApiError(
                    400,
                    'File size too large. Max 5MB allowed.',
                );
            }

            const user = await this.userRepo.findById(userId);
            if (!user) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            // Remove old profile picture
            if (user.profilePicture) {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'profiles',
                    path.basename(user.profilePicture),
                );
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const profilesDir = path.join(process.cwd(), 'uploads', 'profiles');
            if (!fs.existsSync(profilesDir)) {
                fs.mkdirSync(profilesDir, { recursive: true });
            }

            const uploadedPath = profilePicture.path;

            // Validate dimensions
            try {
                const metadata = await sharp(uploadedPath).metadata();

                if (!metadata.width || !metadata.height) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(400, 'Could not read image dimensions');
                }

                if (metadata.width > 1024 || metadata.height > 1024) {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        `Profile picture dimensions must be at most 1024x1024px. Received: ${metadata.width}x${metadata.height}px`,
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
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                const error = validationErr as Error;
                this.logger.error('Profile picture validation error:', error);
                throw new ApiError(
                    400,
                    error.message || 'Failed to validate profile picture image',
                );
            }

            const ext = `.${(await sharp(uploadedPath).metadata()).format}`;
            const filename = `${randomBytes(16).toString('hex')}${ext}`;
            const targetPath = path.join(profilesDir, filename);

            try {
                fs.renameSync(uploadedPath, targetPath);
            } catch (moveErr) {
                this.logger.error('Profile picture file move error:', moveErr);
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                throw new ApiError(500, 'Failed to save profile picture image');
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
                    this.wsServer.broadcastToServer(serverId, {
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
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('banner', { storage }))
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
        @UploadedFile() banner: Express.Multer.File,
        @Req() req: Request,
    ): Promise<UpdateBannerResponseDTO> {
        try {
            const userPayload = (req as unknown as RequestWithUser).user;
            const username = userPayload.username;
            const userId = userPayload.id;

            if (!banner) {
                throw new ApiError(400, ErrorMessages.FILE.NO_FILE_UPLOADED);
            }

            // Allow banners up to 5MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (banner.size > MAX_SIZE) {
                throw new ApiError(
                    400,
                    'File size too large. Max 5MB allowed.',
                );
            }

            const user = await this.userRepo.findById(userId);
            if (!user) {
                throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            // Remove old banner to save storage
            if (user.banner) {
                const oldPath = path.join(
                    process.cwd(),
                    'uploads',
                    'banners',
                    path.basename(user.banner),
                );
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const bannersDir = path.join(process.cwd(), 'uploads', 'banners');
            if (!fs.existsSync(bannersDir)) {
                fs.mkdirSync(bannersDir, { recursive: true });
            }

            const uploadedPath = banner.path;

            // Validate dimensions
            try {
                const metadata = await sharp(uploadedPath).metadata();

                if (!metadata.width || !metadata.height) {
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

                // Check if the banner is webp
                if (metadata.format !== 'webp') {
                    fs.unlinkSync(uploadedPath);
                    throw new ApiError(
                        400,
                        'Invalid file format. Only WebP is allowed.',
                    );
                }
            } catch (validationErr: unknown) {
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                const error = validationErr as Error;
                this.logger.error('Banner validation error:', error);
                throw new ApiError(
                    400,
                    error.message || 'Failed to validate banner image',
                );
            }

            const ext = '.webp';
            const filename = `${randomBytes(16).toString('hex')}${ext}`;
            const targetPath = path.join(bannersDir, filename);

            try {
                fs.renameSync(uploadedPath, targetPath);
            } catch (moveErr) {
                this.logger.error('Banner file move error:', moveErr);
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                throw new ApiError(500, 'Failed to save banner image');
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
                    this.wsServer.broadcastToServer(serverId, {
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
    @ApiResponse({ status: 200, description: 'Banner image' })
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

        const ext = path.extname(filename).toLowerCase();
        const contentTypes: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
        };

        res.setHeader(
            'Content-Type',
            contentTypes[ext] || 'application/octet-stream',
        );
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return new Promise<void>((resolve, _reject) => {
            res.sendFile(filePath, (err) => {
                if (err) {
                    this.logger.error('Error sending banner file:', err);
                    if (!res.headersSent) {
                        res.status(500).send({
                            error: 'Failed to send banner',
                        });
                    }
                    resolve();
                } else {
                    resolve();
                }
            });
        });
    }

    @Patch('bio')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update bio' })
    @ApiResponse({ status: 200, description: 'Bio updated' })
    public async updateBio(
        @Req() req: Request,
        @Body() body: UpdateBioRequestDTO,
    ): Promise<{ message: string; bio: string }> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const { bio } = body;

        await this.userRepo.update(userId, { bio: bio || '' });

        return {
            message: 'Bio updated successfully',
            bio: bio || '',
        };
    }

    @Patch('pronouns')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update pronouns' })
    @ApiResponse({ status: 200, description: 'Pronouns updated' })
    public async updatePronouns(
        @Req() req: Request,
        @Body() body: UpdatePronounsRequestDTO,
    ): Promise<{ message: string; pronouns: string }> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const { pronouns } = body;

        await this.userRepo.update(userId, { pronouns: pronouns || '' });

        return {
            message: 'Pronouns updated successfully',
            pronouns: pronouns || '',
        };
    }

    @Patch('display-name')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update display name' })
    @ApiResponse({ status: 200, description: 'Display name updated' })
    @ApiResponse({ status: 400, description: 'Invalid display name' })
    public async updateDisplayName(
        @Req() req: Request,
        @Body() body: UpdateDisplayNameRequestDTO,
    ): Promise<{ message: string; displayName: string | null }> {
        const userPayload = (req as unknown as RequestWithUser).user;
        const userId = userPayload.id;
        const username = userPayload.username;
        const { displayName } = body;

        await this.userRepo.updateDisplayName(userId, displayName || null);

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                username,
                displayName: updatedUser?.displayName || null,
            };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'display_name_updated',
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
            displayName: updatedUser?.displayName || null,
        };
    }

    @Patch('status')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update custom status' })
    @ApiResponse({ status: 200, description: 'Status updated' })
    @ApiResponse({ status: 400, description: 'Invalid status' })
    public async updateCustomStatus(
        @Req() req: Request,
        @Body() body: UpdateStatusRequestDTO,
    ): Promise<{ customStatus: SerializedCustomStatus | null }> {
        const userPayload = (req as unknown as RequestWithUser).user;
        const userId = userPayload.id;
        const username = userPayload.username;
        const { text, emoji, expiresAt, expiresInMinutes, clear } = body;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        if (
            clear === true ||
            ((text === undefined ||
                text === null ||
                String(text).trim().length === 0) &&
                (!emoji || String(emoji).trim().length === 0))
        ) {
            await this.userRepo.updateCustomStatus(userId, null);

            try {
                // Broadcast status clear to friends and server members
                const serverIds =
                    await this.serverMemberRepo.findServerIdsByUserId(userId);
                const friendships =
                    await this.friendshipRepo.findAllByUserId(userId);

                const payload = { username, status: null };

                // Emit to servers
                serverIds.forEach((serverId) => {
                    this.wsServer.broadcastToServer(serverId, {
                        type: 'status_update',
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
            text: text || '',
            expiresAt: expiresAtDate,
            updatedAt: new Date(),
        };

        if (emoji) {
            newStatus.emoji = emoji;
        }

        await this.userRepo.updateCustomStatus(userId, newStatus);

        const updatedUser = await this.userRepo.findById(userId);
        const serialized = updatedUser
            ? resolveSerializedCustomStatus(updatedUser.customStatus)
            : null;

        try {
            // Broadcast status update to friends and server members
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = { username, status: serialized };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'status_update',
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
    @ApiResponse({ status: 200, description: 'Status cleared' })
    public async clearCustomStatus(
        @Req() req: Request,
    ): Promise<{ customStatus: null }> {
        const userPayload = (req as unknown as RequestWithUser).user;
        const userId = userPayload.id;
        const username = userPayload.username;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.userRepo.updateCustomStatus(userId, null);

        try {
            // Broadcast status clear to friends and server members
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = { username, status: null };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId, {
                    type: 'status_update',
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
    @ApiOperation({ summary: 'Get bulk custom statuses' })
    @ApiResponse({ status: 200, description: 'Bulk statuses' })
    @ApiBody({ type: BulkStatusRequestDTO })
    public async getBulkStatuses(
        @Body() body: BulkStatusRequestDTO,
    ): Promise<{ statuses: Record<string, SerializedCustomStatus | null> }> {
        const { usernames } = body;

        if (!Array.isArray(usernames)) {
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

        const statuses: Record<string, SerializedCustomStatus | null> = {};

        for (const name of sanitized) {
            const user = await this.userRepo.findByUsername(name);
            statuses[name] = user
                ? resolveSerializedCustomStatus(user.customStatus)
                : null;
        }

        return { statuses };
    }

    @Patch('style')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update username style' })
    @ApiResponse({ status: 200, description: 'Style updated' })
    public async updateUsernameStyle(
        @Req() req: Request,
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
        const userPayload = (req as unknown as RequestWithUser).user;
        const userId = userPayload.id;

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
                this.wsServer.broadcastToServer(serverId, {
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

        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        return { _id: user._id.toString() };
    }

    @Patch('username')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Change username' })
    @ApiResponse({ status: 200, description: 'Username changed' })
    @ApiResponse({ status: 409, description: 'Username taken' })
    public async changeUsername(
        @Req() req: Request,
        @Body() body: ChangeUsernameRequestDTO,
    ): Promise<{ message: string; username: string }> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const { newUsername } = body;

        const existingUser = await this.userRepo.findByUsername(newUsername);
        if (existingUser) {
            throw new ApiError(409, ErrorMessages.PROFILE.USERNAME_TAKEN);
        }

        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new ApiError(404, ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const oldUsername = user.username || '';

        await this.userRepo.updateUsername(user._id.toString(), newUsername);

        // Emit socket event
        try {
            const updatedUser = await this.userRepo.findById(
                user._id.toString(),
            );
            const serverIds =
                await this.serverMemberRepo.findServerIdsByUserId(userId);
            const friendships =
                await this.friendshipRepo.findAllByUserId(userId);

            const payload = {
                userId,
                oldUsername,
                newUsername,
                profilePicture: updatedUser?.profilePicture
                    ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                    : null,
                usernameFont: updatedUser?.usernameFont,
                usernameGradient: updatedUser?.usernameGradient,
                usernameGlow: updatedUser?.usernameGlow,
            };

            // Emit to servers
            serverIds.forEach((serverId) => {
                this.wsServer.broadcastToServer(serverId, {
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
    @ApiOperation({ summary: 'Update language' })
    @ApiResponse({ status: 200, description: 'Language updated' })
    public async updateLanguage(
        @Req() req: Request,
        @Body() body: UpdateLanguageRequestDTO,
    ): Promise<{ message: string; language: string }> {
        const username = (req as unknown as RequestWithUser).user.username;
        const { language } = body;

        if (!language || typeof language !== 'string') {
            throw new ApiError(400, 'Language is required');
        }

        const user = await this.userRepo.findByUsername(username);
        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        await this.userRepo.updateLanguage(user._id.toString(), language);

        return {
            message: 'Language preference updated successfully',
            language,
        };
    }

    @Get('picture/:filename')
    @ApiOperation({ summary: 'Get profile picture' })
    @ApiResponse({ status: 200, description: 'Profile picture' })
    @ApiResponse({ status: 400, description: 'Invalid filename' })
    @ApiResponse({ status: 404, description: 'Image not found' })
    public async getProfilePicture(
        @Param() params: FilenameParamDTO,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const { filename } = params;

        if (!filename) {
            res.status(400).send({ error: 'Filename required' });
            return;
        }

        const filePath = path.join(
            process.cwd(),
            'uploads',
            'profiles',
            filename,
        );

        if (!fs.existsSync(filePath)) {
            res.status(404).send({ error: 'Profile picture not found' });
            return;
        }

        const ext = path.extname(filename).toLowerCase();
        const contentTypes: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return new Promise<void>((resolve, _reject) => {
            res.sendFile(filePath, (err) => {
                if (err) {
                    if (!res.headersSent) {
                        res.status(404).send({
                            error: 'Profile picture not found',
                        });
                    }
                    resolve();
                    return;
                }
                resolve();
            });
        });
    }
}
