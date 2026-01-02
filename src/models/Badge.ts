import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

// Badge interface
//
// Represents a decorative badge that can be awarded to users (e.g., 'Bug Hunter')
export interface IBadge extends Document {
    _id: Types.ObjectId;
    id: string; // Unique identifier
    name: string; // Display name
    description: string; // Hover tooltip description
    icon: string; // Icon name
    color: string; // Badge color theme
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

// Badge model
export const Badge = model<IBadge>('Badge', badgeSchema);
