import {
    Controller,
    Get,
    Patch,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
    Post,
    Delete,
    UploadedFile,
} from 'tsoa';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { resolveSerializedCustomStatus } from '@/utils/status';
import type { ILogger } from '@/di/interfaces/ILogger';
import { getIO } from '@/socket';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { mapUser } from '@/utils/user';
import { ErrorMessages } from '@/constants/errorMessages';
import express from 'express';
import { Badge } from '@/models/Badge';
import {
    AssignBadgesRequest,
    BadgeOperationResponse,
} from '@/controllers/models/BadgeTypes';
import { StatusService } from '@/realtime/services/StatusService';
import { hasPermission } from '@/utils/jwt';
import { AdminPermissions } from '@/routes/api/v1/admin/permissions';
import { usernameSchema } from '@/validation/schemas/common';

interface UpdateStatusRequest {
    text?: string;
    emoji?: string;
    expiresAt?: string | null;
    expiresInMinutes?: number;
    clear?: boolean;
}

interface BulkStatusRequest {
    usernames: string[];
}

interface UpdateStyleRequest {
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
}

interface UserLookupResponse {
    _id: string;
}

interface ChangeUsernameRequest {
    newUsername: string;
}

interface UpdateLanguageRequest {
    language: string;
}

/**
 * User profile information including badges and customization
 */
interface BadgeResponse {
    _id: any;
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    createdAt: Date;
}

interface UserProfile {
    /** User's unique identifier */
    id: string;

    /** Username (unique identifier) */
    username: string;

    /** Login name (if different from username) */
    login: string;

    /** Display name shown to other users */
    displayName: string | null;

    /** URL to the user's profile picture */
    profilePicture: string | null;

    /** Font used for username display */
    usernameFont: string;

    /** Gradient settings for username */
    usernameGradient: {
        enabled: boolean;
        colors: string[];
        angle: number;
    };

    /** Glow effect settings for username */
    usernameGlow: {
        enabled: boolean;
        color: string;
        intensity: number;
    };

    /** User's current custom status */
    customStatus: any;

    /** User's permission level */
    permissions: string | AdminPermissions;

    /** When the user account was created */
    createdAt: Date;

    /** User's biography */
    bio: string;

    /** User's pronouns */
    pronouns: string;

    /** List of badges assigned to the user */
    badges: BadgeResponse[];

    /** URL to the user's profile banner */
    banner: string | null;
}

interface BioUpdate {
    bio: string;
}

interface PronounsUpdate {
    pronouns: string;
}

interface DisplayNameUpdate {
    displayName: string;
}

/**
 * Controller for user profile management, customization, and status updates.
 * Enforces  boundaries via JWT ownership checks and admin permission validation.
 */
@injectable()
@Route('api/v1/profile')
@Tags('Profile')
export class ProfileController extends Controller {
    constructor(
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.StatusService) private statusService: StatusService,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
    ) {
        super();
    }

    /**
     * Retrieves the current authenticated user's profile.
     */
    @Get('me')
    @Security('jwt')
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getMyProfile(
        @Request() req: express.Request,
    ): Promise<UserProfile> {
        // @ts-ignore: JWT middleware attaches user object, not typed in Express.Request
        const userId = req.user.id;
        return this.getUserProfile(userId);
    }

    /**
     * Retrieves a user's profile by their unique ID.
     */
    @Get('{userId}')
    @Security('jwt')
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async getUserProfile(@Path() userId: string): Promise<UserProfile> {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            const error = new Error(ErrorMessages.AUTH.USER_NOT_FOUND) as any;
            error.status = 404;
            throw error;
        }

        return this.mapToProfile(user);
    }

    /**
     * Updates a user's badges.
     * Enforces 'MANAGE_USERS' admin permission.
     */
    @Post('{id}/badges')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Bad Request - Invalid badge IDs', {
        error: ErrorMessages.PROFILE.INVALID_BADGE_IDS,
    })
    @Response<ErrorResponse>('401', 'Unauthorized', {
        error: ErrorMessages.AUTH.UNAUTHORIZED,
    })
    @Response<ErrorResponse>('403', 'Forbidden - Insufficient permissions', {
        error: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateUserBadges(
        @Path() id: string,
        @Body() request: AssignBadgesRequest,
        @Request() req: express.Request,
    ): Promise<BadgeOperationResponse> {
        try {
            if (!(req as any).user) {
                this.setStatus(401);
                throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
            }

            if (!hasPermission((req as any).user, 'manageUsers')) {
                this.setStatus(403);
                throw new Error(ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS);
            }

            if (!request.badgeIds || !Array.isArray(request.badgeIds)) {
                this.setStatus(400);
                throw new Error(
                    ErrorMessages.PROFILE.INVALID_REQUEST_BADGE_ARRAY,
                );
            }

            const user = await this.userRepo.findById(id);
            if (!user) {
                this.setStatus(404);
                throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
            }

            if (request.badgeIds.length === 0) {
                await this.userRepo.update(user._id.toString(), { badges: [] });

                const io = getIO();
                io.to(`user:${user._id}`).emit('user_updated', {
                    userId: user._id,
                    badges: [],
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
                this.setStatus(400);
                throw new Error(
                    `Invalid badge IDs: ${invalidBadgeIds.join(', ')}`,
                );
            }

            await this.userRepo.update(user._id.toString(), {
                badges: validBadgeIds,
            });

            const io = getIO();
            io.to(`user:${user._id}`).emit('user_updated', {
                userId: user._id,
                badges: validBadgeIds,
            });

            this.logger.info(
                `User ${(req as any).user.id} updated badges for user ${user._id}`,
                {
                    targetUserId: user._id,
                    badgeCount: validBadgeIds.length,
                    adminUserId: (req as any).user.id,
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

    /**
     * Uploads or updates the user's profile banner.
     * Resizes the image to 1200x300 and Enforces path sanitization.
     */
    @Post('banner')
    @Security('jwt')
    public async uploadBanner(
        @UploadedFile() banner: Express.Multer.File,
        @Request() req: express.Request,
    ): Promise<{ message: string; banner: string }> {
        try {
            // @ts-ignore: JWT middleware attaches user object
            const username = req.user.username;
            // @ts-ignore: JWT middleware attaches user object
            const userId = req.user.id;

            if (!banner) {
                this.setStatus(400);
                throw new Error(ErrorMessages.FILE.NO_FILE_UPLOADED);
            }

            // Allow banners up to 5MB
            const MAX_SIZE = 5 * 1024 * 1024;
            if (banner.size > MAX_SIZE) {
                this.setStatus(400);
                throw new Error('File size too large. Max 5MB allowed.');
            }

            const user = await this.userRepo.findById(userId);
            if (!user) {
                this.setStatus(404);
                throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
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
                    this.setStatus(400);
                    throw new Error('Could not read image dimensions');
                }

                if (metadata.width > 1136 || metadata.height > 400) {
                    fs.unlinkSync(uploadedPath);
                    this.setStatus(400);
                    throw new Error(`Banner dimensions must be at most 1136x400px. Received: ${metadata.width}x${metadata.height}px`);
                }

                // Check if the banner is webp
                if (metadata.format !== 'webp') {
                    fs.unlinkSync(uploadedPath);
                    this.setStatus(400);
                    throw new Error('Invalid file format. Only WebP is allowed.');
                }
            } catch (validationErr: any) {
                if (fs.existsSync(uploadedPath)) {
                    fs.unlinkSync(uploadedPath);
                }
                this.logger.error('Banner validation error:', validationErr);
                this.setStatus(400);
                throw new Error(validationErr.message || 'Failed to validate banner image');
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
                this.setStatus(500);
                throw new Error('Failed to save banner image');
            }


            await this.userRepo.updateBanner(userId, filename);

            const bannerUrl = `/api/v1/profile/banner/${filename}`;

            try {
                const io = getIO();
                const serverIds = await this.serverMemberRepo.findServerIdsByUserId(userId);
                const friendships = await this.friendshipRepo.findAllByUserId(userId);

                const updatePayload = {
                    username,
                    banner: bannerUrl,
                };

                // Emit to all servers the user is in
                serverIds.forEach(serverId => {
                    io.to(`server:${serverId}`).emit('user_banner_updated', updatePayload);
                });

                // Emit to all friends
                friendships.forEach(friendship => {
                    const friendId = friendship.userId.toString() === userId
                        ? friendship.friendId.toString()
                        : friendship.userId.toString();
                    io.to(`user:${friendId}`).emit('user_banner_updated', updatePayload);
                });

                // Also emit to the user themselves (for other sessions)
                io.to(`user:${userId}`).emit('user_banner_updated', updatePayload);

            } catch (err) {
                this.logger.error('Failed to emit banner update:', err);
            }

            return {
                message: 'Profile banner updated successfully',
                banner: bannerUrl,
            };
        } catch (err: any) {
            this.logger.error('Banner upload error:', err);
            throw err;
        }
    }

    /**
     * Serves a profile banner file.
     */
    @Get('banner/{filename}')
    public async getBanner(
        @Path() filename: string,
        @Request() req: express.Request,
    ): Promise<void> {
        const res = req.res;
        if (!res) throw new Error('Response object not found');

        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            res.status(400).send({ error: 'Invalid filename' });
            return;
        }

        const filePath = path.join(process.cwd(), 'uploads', 'banners', filename);

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

        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return new Promise<void>((resolve, reject) => {
            res.sendFile(filePath, (err) => {
                if (err) {
                    this.logger.error('Error sending banner file:', err);
                    if (!res.headersSent) {
                        res.status(500).send({ error: 'Failed to send banner' });
                    }
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Updates the current user's biography.
     */
    @Patch('bio')
    @Security('jwt')
    public async updateBio(
        @Request() req: express.Request,
        @Body() body: BioUpdate,
    ): Promise<{ message: string; bio: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { bio } = body;

        await this.userRepo.update(userId, { bio: bio || '' });

        return {
            message: 'Bio updated successfully',
            bio: bio || '',
        };
    }

    /**
     * Updates the current user's pronouns.
     */
    @Patch('pronouns')
    @Security('jwt')
    public async updatePronouns(
        @Request() req: express.Request,
        @Body() body: PronounsUpdate,
    ): Promise<{ message: string; pronouns: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        const { pronouns } = body;

        await this.userRepo.update(userId, { pronouns: pronouns || '' });

        return {
            message: 'Pronouns updated successfully',
            pronouns: pronouns || '',
        };
    }

    /**
     * Updates the current user's display name.
     */
    @Patch('display-name')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid display name', {
        error: ErrorMessages.PROFILE.DISPLAY_NAME_TOO_LONG,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateDisplayName(
        @Request() req: express.Request,
        @Body() body: DisplayNameUpdate,
    ): Promise<{ message: string; displayName: string | null }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        // @ts-ignore: JWT middleware attaches user object
        const username = req.user.username;
        const { displayName } = body;

        await this.userRepo.updateDisplayName(userId, displayName || null);

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const io = getIO();
            io.emit('display_name_updated', {
                username,
                displayName: updatedUser?.displayName || null,
            });
        } catch (err) {
            this.logger.error('Failed to emit display name update:', err);
        }

        return {
            message: 'Display name updated successfully',
            displayName: updatedUser?.displayName || null,
        };
    }

    /**
     * Updates the current user's custom status.
     */
    @Patch('status')
    @Security('jwt')
    @Response<ErrorResponse>('400', 'Invalid status', {
        error: ErrorMessages.PROFILE.STATUS_TOO_LONG,
    })
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async updateCustomStatus(
        @Request() req: express.Request,
        @Body() body: UpdateStatusRequest,
    ): Promise<{ customStatus: any }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        // @ts-ignore: JWT middleware attaches user object
        const username = req.user.username;
        const { text, emoji, expiresAt, expiresInMinutes, clear } = body;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
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
                const io = getIO();
                this.statusService.publishStatusUpdate(io, username, null);
            } catch (err) {
                this.logger.error('Failed to publish status clear:', err);
            }

            return { customStatus: null };
        }

        const trimmedText = typeof text === 'string' ? text.trim() : '';
        if (trimmedText.length > 120) {
            this.setStatus(400);
            throw new Error(ErrorMessages.PROFILE.STATUS_TOO_LONG);
        }

        const normalizedEmoji = typeof emoji === 'string' ? emoji.trim() : '';
        if (normalizedEmoji.length > 0) {
            const customEmojiMatch = normalizedEmoji.match(
                /^<emoji:([a-fA-F0-9]{24})>$/,
            );

            if (!customEmojiMatch) {
                const segmenter = new Intl.Segmenter('en', {
                    granularity: 'grapheme',
                });
                const graphemes = Array.from(
                    segmenter.segment(normalizedEmoji),
                );

                if (graphemes.length > 1) {
                    this.setStatus(400);
                    throw new Error(ErrorMessages.PROFILE.ONLY_ONE_EMOJI);
                }
                if (!/\p{Emoji}/u.test(normalizedEmoji)) {
                    this.setStatus(400);
                    throw new Error(ErrorMessages.PROFILE.INVALID_EMOJI);
                }
            }
        }

        if (!trimmedText && !normalizedEmoji) {
            this.setStatus(400);
            throw new Error(
                ErrorMessages.PROFILE.STATUS_TEXT_OR_EMOJI_REQUIRED,
            );
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
                this.setStatus(400);
                throw new Error(ErrorMessages.PROFILE.INVALID_EXPIRES_AT);
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
            text: trimmedText,
            expiresAt: expiresAtDate,
            updatedAt: new Date(),
        };

        if (normalizedEmoji) {
            newStatus.emoji = normalizedEmoji;
        }

        await this.userRepo.updateCustomStatus(userId, newStatus);

        const updatedUser = await this.userRepo.findById(userId);
        const serialized = updatedUser
            ? resolveSerializedCustomStatus(updatedUser.customStatus)
            : null;

        try {
            const io = getIO();
            this.statusService.publishStatusUpdate(io, username, serialized);
        } catch (err) {
            this.logger.error('Failed to publish custom status update:', err);
        }

        return { customStatus: serialized };
    }

    /**
     * Clears the current user's custom status.
     */
    @Delete('status')
    @Security('jwt')
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async clearCustomStatus(
        @Request() req: express.Request,
    ): Promise<{ customStatus: null }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        // @ts-ignore: JWT middleware attaches user object
        const username = req.user.username;

        const user = await this.userRepo.findById(userId);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        await this.userRepo.updateCustomStatus(userId, null);

        try {
            const io = getIO();
            this.statusService.publishStatusUpdate(io, username, null);
        } catch (err) {
            this.logger.error('Failed to publish status clear:', err);
        }

        return { customStatus: null };
    }

    /**
     * Retrieves custom statuses for multiple users in bulk.
     */
    @Post('status/bulk')
    public async getBulkStatuses(
        @Body() body: BulkStatusRequest,
    ): Promise<{ statuses: Record<string, any> }> {
        const { usernames } = body;

        if (!Array.isArray(usernames)) {
            this.setStatus(400);
            throw new Error(ErrorMessages.PROFILE.USERNAMES_ARRAY_REQUIRED);
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

        const statuses: Record<string, any> = {};

        for (const name of sanitized) {
            const user = await this.userRepo.findByUsername(name);
            statuses[name] = user
                ? resolveSerializedCustomStatus(user.customStatus)
                : null;
        }

        return { statuses };
    }

    /**
     * Updates the current user's username styling (font, gradient, glow).
     */
    @Patch('style')
    @Security('jwt')
    public async updateUsernameStyle(
        @Request() req: express.Request,
        @Body() body: UpdateStyleRequest,
    ): Promise<{
        message: string;
        usernameFont?: string;
        usernameGradient?: any;
        usernameGlow?: any;
    }> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;
        // @ts-ignore: JWT middleware attaches user object
        const username = req.user.username;

        const { usernameFont, usernameGradient, usernameGlow } = body;

        await this.userRepo.updateUsernameStyle(userId, {
            usernameFont,
            usernameGradient,
            usernameGlow,
        });

        const updatedUser = await this.userRepo.findById(userId);

        try {
            const io = getIO();
            io.emit('username_style_updated', {
                username,
                usernameFont: updatedUser?.usernameFont,
                usernameGradient: updatedUser?.usernameGradient,
                usernameGlow: updatedUser?.usernameGlow,
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

    /**
     * Resolves a username to its corresponding user ID.
     */
    @Get('lookup/{username}')
    @Security('jwt')
    @Response<ErrorResponse>('404', 'User not found', {
        error: ErrorMessages.AUTH.USER_NOT_FOUND,
    })
    public async lookupUserByUsername(
        @Path() username: string,
    ): Promise<UserLookupResponse> {
        const user = await this.userRepo.findByUsername(username);

        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        return { _id: user._id.toString() };
    }

    /**
     * Changes the current user's username.
     * Enforces strict format validation and uniqueness.
     */
    @Patch('username')
    @Security('jwt')
    public async changeUsername(
        @Request() req: express.Request,
        @Body() body: ChangeUsernameRequest,
    ): Promise<{ message: string; username: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const currentUsername = req.user.username;
        const { newUsername } = body;

        if (!newUsername || typeof newUsername !== 'string') {
            this.setStatus(400);
            throw new Error(ErrorMessages.PROFILE.NEW_USERNAME_REQUIRED);
        }

        const validation = usernameSchema.safeParse(newUsername);
        if (!validation.success) {
            this.setStatus(400);
            throw new Error(
                validation.error.issues[0]?.message || 'Invalid username',
            );
        }

        const existingUser = await this.userRepo.findByUsername(newUsername);
        if (existingUser) {
            this.setStatus(409);
            throw new Error(ErrorMessages.PROFILE.USERNAME_TAKEN);
        }

        const user = await this.userRepo.findByUsername(currentUsername);
        if (!user) {
            this.setStatus(404);
            throw new Error(ErrorMessages.AUTH.USER_NOT_FOUND);
        }

        const oldUsername = user.username || '';

        await this.userRepo.updateUsername(user._id.toString(), newUsername);

        // Emit socket event
        try {
            const io = getIO();
            const updatedUser = await this.userRepo.findById(
                user._id.toString(),
            );
            io.emit('username_changed', {
                oldUsername,
                newUsername,
                profilePicture: updatedUser?.profilePicture
                    ? `/api/v1/profile/picture/${updatedUser.profilePicture}`
                    : null,
                usernameFont: updatedUser?.usernameFont,
                usernameGradient: updatedUser?.usernameGradient,
                usernameGlow: updatedUser?.usernameGlow,
            });
        } catch (err) {
            this.logger.error('Failed to emit username change:', err);
        }

        return {
            message: 'Username changed successfully',
            username: newUsername,
        };
    }

    /**
     * Updates the current user's language preference.
     */
    @Patch('language')
    @Security('jwt')
    public async updateLanguage(
        @Request() req: express.Request,
        @Body() body: UpdateLanguageRequest,
    ): Promise<{ message: string; language: string }> {
        // @ts-ignore: JWT middleware attaches user object
        const username = req.user.username;
        const { language } = body;

        if (!language || typeof language !== 'string') {
            this.setStatus(400);
            throw new Error('Language is required');
        }

        const user = await this.userRepo.findByUsername(username);
        if (!user) {
            this.setStatus(404);
            throw new Error('User not found');
        }

        await this.userRepo.updateLanguage(user._id.toString(), language);

        return {
            message: 'Language preference updated successfully',
            language,
        };
    }

    /**
     * Serves a profile picture file.
     */
    @Get('picture/{filename}')
    public async getProfilePicture(
        @Path() filename: string,
        @Request() req: express.Request,
    ): Promise<void> {
        const res = req.res;
        if (!res) {
            throw new Error('Response object not found');
        }

        if (!filename) {
            res.status(400).send({ error: 'Filename required' });
            return;
        }

        // No more path traversal attacks :3
        if (
            filename.includes('..') ||
            filename.includes('/') ||
            filename.includes('\\')
        ) {
            res.status(400).send({ error: 'Invalid filename' });
            return;
        }

        const path = require('path');
        const fs = require('fs');
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

    /**
     * Maps a user document to a public UserProfile payload.
     */
    private async mapToProfile(user: any): Promise<UserProfile> {
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

        mapped.banner = user.banner
            ? `/api/v1/profile/banner/${user.banner}`
            : null;

        return mapped as unknown as UserProfile;
    }
}
