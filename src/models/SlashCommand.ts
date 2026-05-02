import { Schema, model } from 'mongoose';
import type { Document, Types } from 'mongoose';

export interface ISlashCommandOption {
    type: number;
    name: string;
    description: string;
    required?: boolean;
}

export interface ISlashCommand extends Document {
    _id: Types.ObjectId;
    botId: Types.ObjectId;
    name: string;
    description: string;
    options?: ISlashCommandOption[];
    shouldReply: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const optionSchema = new Schema<ISlashCommandOption>({
    type: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    required: { type: Boolean, default: false },
}, { _id: false });

const schema = new Schema<ISlashCommand>(
    {
        botId: { type: Schema.Types.ObjectId, ref: 'Bot', required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        options: { type: [optionSchema], default: [] },
        shouldReply: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    },
);

schema.index({ botId: 1, name: 1 }, { unique: true });

export const SlashCommand = model<ISlashCommand>('SlashCommand', schema);
