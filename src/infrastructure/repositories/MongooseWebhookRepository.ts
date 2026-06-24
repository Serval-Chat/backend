import { injectable } from 'inversify';
import {
    IWebhookRepository,
    IWebhook,
} from '@/di/interfaces/IWebhookRepository';
import { Webhook } from '@/models/Webhook';

// Mongoose Webhook repository
//
// Implements IWebhookRepository using Mongoose Webhook model
@injectable()
export class MongooseWebhookRepository implements IWebhookRepository {
    public async findById(id: string): Promise<IWebhook | null> {
        return await Webhook.findOne({ snowflakeId: id }).lean();
    }

    // Find webhook by its secret token
    //
    // Used to authenticate incoming webhook execution requests */
    public async findByToken(token: string): Promise<IWebhook | null> {
        return await Webhook.findOne({ token }).lean();
    }

    public async findByServerId(serverId: string): Promise<IWebhook[]> {
        return await Webhook.find({ serverId }).lean();
    }

    public async findByChannelId(channelId: string): Promise<IWebhook[]> {
        return await Webhook.find({ channelId }).lean();
    }

    public async create(data: {
        serverId: string;
        channelId: string;
        name: string;
        token: string;
        avatarUrl?: string;
        createdBy: string;
    }): Promise<IWebhook> {
        const webhook = new Webhook(data);
        return await webhook.save();
    }

    public async update(
        id: string,
        data: Partial<IWebhook>,
    ): Promise<IWebhook | null> {
        return await Webhook.findOneAndUpdate({ snowflakeId: id }, data, {
            new: true,
        }).lean();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Webhook.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }
}
