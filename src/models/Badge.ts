import { mongooseIdPlugin } from '@/utils/mongooseId';
import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const BADGE_ICONS = [
    'hashtag',
    'speech_bubble',
    'megaphone',
    'bell',
    'newspaper',
    'info_mark',
    'book_with_checkmark',
    'scroll',
    'microphone',
    'headphones',
    'camera',
    'pallete',
    'film_roll',
    'music_note',
    'game_pad',
    'dice',
    'trophy',
    'code_brackets',
    'laptop',
    'gear',
    'heart',
    'star',
    'calendar',
    'pin',
    'cat',
    'crown',
    'shield',
    'zap',
    'bug',
    'hammer',
] as const;

export type BadgeIcon = (typeof BADGE_ICONS)[number];

// Badge interface
//
// Represents a decorative badge that can be awarded to users (e.g., 'Bug Hunter')
export interface IBadge extends Document {
    _id: Types.ObjectId;
    id: string; // Unique identifier
    name: string; // Display name
    description: string; // Hover tooltip description
    icon: BadgeIcon; // Icon name
    color: string; // Badge color theme
    snowflakeId?: string;
    createdAt: Date;
}

const badgeSchema = new Schema<IBadge>({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    color: { type: String, required: true, default: '#3b82f6' },
    createdAt: { type: Date, default: Date.now },
});

badgeSchema.plugin(mongooseIdPlugin);

// Badge model
export const Badge = model<IBadge>('Badge', badgeSchema);
