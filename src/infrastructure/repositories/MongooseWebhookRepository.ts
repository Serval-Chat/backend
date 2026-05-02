import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import { Types } from 'mongoose';
import {
    IWebhookRepository,
    IWebhook,
} from '@/di/interfaces/IWebhookRepository';
import { Webhook } from '@/models/Webhook';

// Mongoose Webhook repository
//
// Implements IWebhookRepository using Mongoose Webhook model
@injectable()
@Injectable()
export class MongooseWebhookRepository implements IWebhookRepository {
    public async findById(id: Types.ObjectId): Promise<IWebhook | null> {
        return await Webhook.findById(id).lean();
    }

    // Find webhook by its secret token
    //
    // Used to authenticate incoming webhook execution requests */
    public async findByToken(token: string): Promise<IWebhook | null> {
        return await Webhook.findOne({ token }).lean();
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<IWebhook[]> {
        return await Webhook.find({ serverId }).lean();
    }

    public async findByChannelId(channelId: Types.ObjectId): Promise<IWebhook[]> {
        return await Webhook.find({ channelId }).lean();
    }

    public async create(data: {
        serverId: Types.ObjectId;
        channelId: Types.ObjectId;
        name: string;
        token: string;
        avatarUrl?: string;
        createdBy: Types.ObjectId;
    }): Promise<IWebhook> {
        const webhook = new Webhook(data);
        return await webhook.save();
    }

    public async update(
        id: Types.ObjectId,
        data: Partial<IWebhook>,
    ): Promise<IWebhook | null> {
        return await Webhook.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Webhook.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }
}
