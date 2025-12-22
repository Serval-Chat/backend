import type { Types } from 'mongoose';

/**
 * Reaction Repository Interface
 *
 * Provides methods for managing emoji reactions on messages.
 * Supports both DM and server messages with Unicode and custom emojis.
 */

interface BaseReactionData {
    /**
     * The number of reactions
     */
    count: number;
    /**
     * List of user IDs who reacted
     */
    users: string[];
}

export interface UnicodeReactionData extends BaseReactionData {
    /**
     * The unicode emoji character
     */
    emoji: string;
    /**
     * The type of emoji
     */
    emojiType: 'unicode';
}

export interface CustomReactionData extends BaseReactionData {
    /**
     * The name of the custom emoji
     */
    emoji: string;
    /**
     * The type of emoji
     */
    emojiType: 'custom';
    /**
     * The ID of the custom emoji
     */
    emojiId: string;
    /**
     * The name of the custom emoji (redundant but kept for compatibility)
     */
    emojiName?: string;
    /**
     * The URL of the custom emoji
     */
    emojiUrl?: string;
}

export type ReactionData = UnicodeReactionData | CustomReactionData;

export interface IReactionRepository {
    /**
     * Add a reaction to a message
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @param userId - ID of the user reacting
     * @param emoji - Emoji character (unicode) or name (custom)
     * @param emojiType - Type of emoji ('unicode' | 'custom')
     * @param emojiId - Optional emoji ID for custom emojis
     * @returns The created reaction
     * @throws Error if reaction already exists or limit exceeded
     */
    addReaction(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji: string,
        emojiType: 'unicode' | 'custom',
        emojiId?: string,
    ): Promise<any>;

    /**
     * Remove a reaction from a message
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @param userId - ID of the user removing reaction
     * @param emoji - Emoji character (for unicode) or undefined
     * @param emojiId - Emoji ID (for custom) or undefined
     * @returns True if removed, false if not found
     */
    removeReaction(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji?: string,
        emojiId?: string,
    ): Promise<boolean>;

    /**
     * Get all reactions for a message, grouped by emoji.
     *
     * Returns a list of unique emojis with their counts and the users who
     * reacted with them.
     *
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @param currentUserId - Optional current user ID to mark hasReacted
     * @returns Array of reaction data grouped by emoji
     */
    getReactionsByMessage(
        messageId: string,
        messageType: 'dm' | 'server',
        currentUserId?: string,
    ): Promise<ReactionData[]>;

    /**
     * Get reactions for multiple messages
     * @param messageIds - IDs of the messages
     * @param messageType - Type of message ('dm' | 'server')
     * @param currentUserId - Optional current user ID
     * @returns Map of messageId to reaction data
     */
    getReactionsForMessages(
        messageIds: string[],
        messageType: 'dm' | 'server',
        currentUserId?: string,
    ): Promise<Record<string, ReactionData[]>>;

    /**
     * Get total count of unique emoji reactions on a message
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @returns Count of unique emoji types
     */
    getReactionCount(
        messageId: string,
        messageType: 'dm' | 'server',
    ): Promise<number>;

    /**
     * Check if a user has already reacted with a specific emoji.
     *
     * Used for UI state (e.g., highlighting the reaction pill).
     *
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @param userId - ID of the user
     * @param emoji - Emoji character (for unicode) or undefined
     * @param emojiId - Emoji ID (for custom) or undefined
     * @returns True if user has already reacted
     */
    hasUserReacted(
        messageId: string,
        messageType: 'dm' | 'server',
        userId: string,
        emoji?: string,
        emojiId?: string,
    ): Promise<boolean>;

    /**
     * Delete all reactions for a specific message
     * Used when a message is deleted
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @returns Number of reactions deleted
     */
    deleteAllForMessage(
        messageId: string,
        messageType: 'dm' | 'server',
    ): Promise<number>;

    /**
     * Delete all reactions by a specific user
     * Used when a user is deleted
     * @param userId - ID of the user
     * @returns Number of reactions deleted
     */
    deleteAllByUser(userId: string): Promise<number>;

    /**
     * Remove all reactions of a specific emoji from a message
     * @param messageId - ID of the message
     * @param messageType - Type of message ('dm' | 'server')
     * @param emoji - Emoji character (for unicode) or undefined
     * @param emojiId - Emoji ID (for custom) or undefined
     * @returns Number of reactions deleted
     */
    removeEmojiFromMessage(
        messageId: string,
        messageType: 'dm' | 'server',
        emoji?: string,
        emojiId?: string,
    ): Promise<number>;
}
