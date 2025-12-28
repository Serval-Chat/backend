import {
    Controller,
    Get,
    Route,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/di/types';
import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from '@/controllers/models/ErrorResponse';
import { ErrorMessages } from '@/constants/errorMessages';

/**
 * Controller for emoji management.
 * Provides access to server-specific and global emojis.
 */
@injectable()
@Route('api/v1/emojis')
@Tags('Emojis')
@Security('jwt')
export class EmojiController extends Controller {
    constructor(
        @inject(TYPES.EmojiRepository) private emojiRepo: IEmojiRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    /**
     * Retrieves all emojis from all servers the user is a member of.
     */
    @Get()
    public async getAllEmojis(@Request() req: express.Request): Promise<any[]> {
        // @ts-ignore: JWT middleware attaches user object, not typed in Express.Request
        const userId = req.user.id;

        if (!userId) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        const memberships = await this.serverMemberRepo.findAllByUserId(userId);
        // Extract server IDs from membership objects
        const serverIds = memberships.map((m) => m.serverId.toString());

        return await this.emojiRepo.findByServerIds(serverIds);
    }

    /**
     * Retrieves a specific emoji by ID.
     */
    @Get('{emojiId}')
    @Response<ErrorResponse>('404', 'Emoji Not Found', {
        error: ErrorMessages.EMOJI.NOT_FOUND,
    })
    public async getEmojiById(
        @Path() emojiId: string,
        @Request() req: express.Request,
    ): Promise<any> {
        // @ts-ignore: JWT middleware attaches user object
        const userId = req.user.id;

        if (!userId) {
            this.setStatus(401);
            throw new Error(ErrorMessages.AUTH.UNAUTHORIZED);
        }

        // Fetch emoji by its unique ID
        const emoji = await this.emojiRepo.findById(emojiId);
        if (!emoji) {
            this.setStatus(404);
            throw new Error(ErrorMessages.EMOJI.NOT_FOUND);
        }

        return emoji;
    }
}
