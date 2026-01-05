import { injectable } from 'inversify';
import { type FilterQuery, type PipelineStage, Types } from 'mongoose';
import type {
    IReactionRepository,
    ReactionData,
} from '@/di/interfaces/IReactionRepository';
import { Reaction, IReaction } from '@/models/Reaction';
import { Emoji } from '@/models/Emoji';
import { ErrorMessages } from '@/constants/errorMessages';

// Mongoose implementation of IReactionRepository
// Handles all database operations for emoji reactions
// Enforces rules:
// - Maximum 20 unique emoji types per message
// - Users can only react once per emoji per message
// - Custom emojis must exist in the Emoji collection

@injectable()
export class MongooseReactionRepository implements IReactionRepository {
    private readonly MAX_REACTIONS_PER_MESSAGE = 20;

    async addReaction(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji: string,
        emojiType: 'unicode' | 'custom',
        emojiId?: string,
    ): Promise<IReaction> {
        // Validate custom emoji exists
        if (emojiType === 'custom') {
            if (!emojiId) {
                throw new Error(ErrorMessages.REACTION.EMOJI_ID_REQUIRED);
            }

            const customEmoji = await Emoji.findById(emojiId);
            if (!customEmoji) {
                throw new Error(ErrorMessages.REACTION.CUSTOM_NOT_FOUND);
            }
        }

        // Check if user already reacted with this emoji
        const existingReaction = await this.hasUserReacted(
            messageId,
            messageType,
            userId,
            emojiType === 'unicode' ? emoji : undefined,
            emojiType === 'custom' ? emojiId : undefined,
        );

        if (existingReaction) {
            throw new Error(ErrorMessages.REACTION.ALREADY_REACTED);
        }

        // Check if this emoji type already exists on the message
        const emojiExistsQuery: FilterQuery<IReaction> = {
            messageId: new Types.ObjectId(messageId),
            messageType,
        };

        if (emojiId) {
            emojiExistsQuery.emojiId = new Types.ObjectId(emojiId);
        } else {
            emojiExistsQuery.emoji = emoji;
            emojiExistsQuery.emojiType = 'unicode';
        }

        const emojiExists = await Reaction.exists(emojiExistsQuery);

        // Only check limit if this is a new emoji type for this message
        if (!emojiExists) {
            const currentCount = await this.getReactionCount(
                messageId,
                messageType,
            );
            if (currentCount >= this.MAX_REACTIONS_PER_MESSAGE) {
                throw new Error(ErrorMessages.REACTION.MAX_REACTIONS);
            }
        }

        // Create the reaction
        const reaction = new Reaction({
            messageId: new Types.ObjectId(messageId),
            messageType,
            userId: new Types.ObjectId(userId),
            emoji,
            emojiType,
            emojiId: emojiId ? new Types.ObjectId(emojiId) : undefined,
        });

        return await reaction.save();
    }

    async removeReaction(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji?: string,
        emojiId?: string,
    ): Promise<boolean> {
        // Build query
        const query: FilterQuery<IReaction> = {
            messageId: new Types.ObjectId(messageId),
            messageType,
            userId: new Types.ObjectId(userId),
        };

        // Add emoji filter based on type
        if (emojiId) {
            query.emojiId = new Types.ObjectId(emojiId);
        } else if (emoji) {
            query.emoji = emoji;
            query.emojiType = 'unicode';
        } else {
            throw new Error(ErrorMessages.REACTION.EMOJI_OR_ID_REQUIRED);
        }

        const result = await Reaction.deleteOne(query);
        return result.deletedCount > 0;
    }

    async getReactionsByMessage(
        messageId: string,
        messageType: 'dm' | 'server',
        _currentUserId?: string,
    ): Promise<ReactionData[]> {
        // Groups reactions by emoji
        // For each emoji (unicode or custom emojiId), counts how many times
        // It appears and collects the users who reacted with it
        const pipeline: PipelineStage[] = [
            {
                $match: {
                    messageId: new Types.ObjectId(messageId),
                    messageType,
                },
            },
            {
                $group: {
                    _id: {
                        emoji: '$emoji',
                        emojiType: '$emojiType',
                        emojiId: '$emojiId',
                    },
                    count: { $sum: 1 },
                    users: { $push: '$userId' },
                    minCreatedAt: { $min: '$createdAt' },
                },
            },
            {
                $sort: { minCreatedAt: 1 },
            },
        ];

        const results = await Reaction.aggregate(pipeline);

        // Fetch custom emoji details
        const emojiIds = results
            .filter((r) => r._id.emojiId)
            .map((r) => r._id.emojiId);

        const customEmojis =
            emojiIds.length > 0
                ? await Emoji.find({ _id: { $in: emojiIds } })
                : [];

        const emojiMap = new Map(
            customEmojis.map((e) => [
                e._id.toString(),
                { name: e.name, url: e.imageUrl },
            ]),
        );

        // Transform results
        return results.map((r) => {
            const userIds = r.users.map((id: Types.ObjectId) => id.toString());

            if (r._id.emojiType === 'custom') {
                const emojiIdStr = r._id.emojiId
                    ? r._id.emojiId.toString()
                    : '';
                const emojiInfo = emojiMap.get(emojiIdStr);

                return {
                    emoji: r._id.emoji,
                    emojiType: 'custom',
                    count: r.count,
                    users: userIds,
                    emojiId: emojiIdStr,
                    emojiName: emojiInfo?.name,
                    emojiUrl: emojiInfo?.url,
                };
            } else {
                return {
                    emoji: r._id.emoji,
                    emojiType: 'unicode',
                    count: r.count,
                    users: userIds,
                };
            }
        });
    }

    async getReactionsForMessages(
        messageIds: string[],
        messageType: 'dm' | 'server',
        _currentUserId?: string,
    ): Promise<Record<string, ReactionData[]>> {
        if (messageIds.length === 0) return {};

        const objectIds = messageIds.map((id) => new Types.ObjectId(id));

        const pipeline: PipelineStage[] = [
            {
                $match: {
                    messageId: { $in: objectIds },
                    messageType,
                },
            },
            {
                $group: {
                    _id: {
                        messageId: '$messageId',
                        emoji: '$emoji',
                        emojiType: '$emojiType',
                        emojiId: '$emojiId',
                    },
                    count: { $sum: 1 },
                    users: { $push: '$userId' },
                    minCreatedAt: { $min: '$createdAt' },
                },
            },
            {
                $sort: { minCreatedAt: 1 },
            },
        ];

        const results = await Reaction.aggregate(pipeline);

        // Fetch custom emoji details
        const emojiIds = results
            .filter((r) => r._id.emojiId)
            .map((r) => r._id.emojiId);

        const customEmojis =
            emojiIds.length > 0
                ? await Emoji.find({ _id: { $in: emojiIds } })
                : [];

        const emojiMap = new Map(
            customEmojis.map((e) => [
                e._id.toString(),
                { name: e.name, url: e.imageUrl },
            ]),
        );

        // Group by messageId
        const reactionsByMessage: Record<string, ReactionData[]> = {};

        results.forEach((r) => {
            const messageId = r._id.messageId.toString();
            if (!reactionsByMessage[messageId]) {
                reactionsByMessage[messageId] = [];
            }

            const userIds = r.users.map((id: Types.ObjectId) => id.toString());

            if (r._id.emojiType === 'custom') {
                const emojiIdStr = r._id.emojiId
                    ? r._id.emojiId.toString()
                    : '';
                const emojiInfo = emojiMap.get(emojiIdStr);

                reactionsByMessage[messageId].push({
                    emoji: r._id.emoji,
                    emojiType: 'custom',
                    count: r.count,
                    users: userIds,
                    emojiId: emojiIdStr,
                    emojiName: emojiInfo?.name,
                    emojiUrl: emojiInfo?.url,
                });
            } else {
                reactionsByMessage[messageId].push({
                    emoji: r._id.emoji,
                    emojiType: 'unicode',
                    count: r.count,
                    users: userIds,
                });
            }
        });

        return reactionsByMessage;
    }

    async getReactionCount(
        messageId: string,
        messageType: 'dm' | 'server',
    ): Promise<number> {
        // Count unique emoji types (not total reactions)
        // Used to enforce the MAX_REACTIONS_PER_MESSAGE limit
        const pipeline = [
            {
                $match: {
                    messageId: new Types.ObjectId(messageId),
                    messageType,
                },
            },
            {
                $group: {
                    _id: {
                        emoji: '$emoji',
                        emojiId: '$emojiId',
                    },
                },
            },
            {
                $count: 'uniqueEmojis',
            },
        ];

        const result = await Reaction.aggregate(pipeline);
        return result.length > 0 ? result[0].uniqueEmojis : 0;
    }

    async hasUserReacted(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji?: string,
        emojiId?: string,
    ): Promise<boolean> {
        const query: FilterQuery<IReaction> = {
            messageId: new Types.ObjectId(messageId),
            messageType,
            userId: new Types.ObjectId(userId),
        };

        if (emojiId) {
            query.emojiId = new Types.ObjectId(emojiId);
        } else if (emoji) {
            query.emoji = emoji;
            query.emojiType = 'unicode';
        } else {
            throw new Error(ErrorMessages.REACTION.EMOJI_OR_ID_REQUIRED);
        }

        const reaction = await Reaction.findOne(query);
        return reaction !== null;
    }

    async deleteAllForMessage(
        messageId: string,
        messageType: 'dm' | 'server',
    ): Promise<number> {
        const result = await Reaction.deleteMany({
            messageId: new Types.ObjectId(messageId),
            messageType,
        });

        return result.deletedCount || 0;
    }

    async deleteAllByUser(userId: string): Promise<number> {
        const result = await Reaction.deleteMany({
            userId: new Types.ObjectId(userId),
        });

        return result.deletedCount || 0;
    }

    async removeEmojiFromMessage(
        messageId: string,
        messageType: 'dm' | 'server',
        emoji?: string,
        emojiId?: string,
    ): Promise<number> {
        // Build query
        const query: FilterQuery<IReaction> = {
            messageId: new Types.ObjectId(messageId),
            messageType,
        };

        // Add emoji filter based on type
        if (emojiId) {
            query.emojiId = new Types.ObjectId(emojiId);
        } else if (emoji) {
            query.emoji = emoji;
            query.emojiType = 'unicode';
        } else {
            throw new Error(ErrorMessages.REACTION.EMOJI_OR_ID_REQUIRED);
        }

        const result = await Reaction.deleteMany(query);
        return result.deletedCount || 0;
    }
}
