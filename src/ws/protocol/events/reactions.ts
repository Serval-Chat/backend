import type { WsEvent } from '@/ws/protocol/event';

/**
 * Client → Server
 * Add a reaction to a message.
 */
export interface IAddReactionEvent
    extends WsEvent<
        'add_reaction',
        {
            messageId: string;
            emoji: string; // Emoji unicode or custom emoji name
            emojiType: 'unicode' | 'custom';
            emojiId?: string; // Required for custom emojis
            messageType: 'dm' | 'server';
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Reaction was added to a message.
 */
export interface IReactionAddedEvent
    extends WsEvent<
        'reaction_added',
        {
            messageId: string;
            userId: string;
            username: string;
            emoji: string;
            emojiType: 'unicode' | 'custom';
            emojiId?: string;
            messageType: 'dm' | 'server';
        }
    > {}

/**
 * Client → Server
 * Remove a reaction from a message.
 */
export interface IRemoveReactionEvent
    extends WsEvent<
        'remove_reaction',
        {
            messageId: string;
            emoji: string;
            emojiType: 'unicode' | 'custom';
            emojiId?: string;
            messageType: 'dm' | 'server';
        }
    > {}

/**
 * Server → Client (Broadcast)
 * Reaction was removed from a message.
 */
export interface IReactionRemovedEvent
    extends WsEvent<
        'reaction_removed',
        {
            messageId: string;
            userId: string;
            emoji: string;
            emojiType: 'unicode' | 'custom';
            emojiId?: string;
            messageType: 'dm' | 'server';
        }
    > {}
