import { injectable } from 'inversify';
import {
    IWebhookRepository,
    IWebhook,
} from '@/di/interfaces/IWebhookRepository';
import { Webhook } from '@/models/Webhook';

/**
 * Mongoose Webhook Repository
 *
 * Implements IWebhookRepository using Mongoose Webhook model.
 */
@injectable()
export class MongooseWebhookRepository implements IWebhookRepository {
    async findById(id: string): Promise<IWebhook | null> {
        return await Webhook.findById(id).lean();
    }

    /**
     * Find webhook by its secret token.
     *
     * Used to authenticate incoming webhook execution requests.
     */
    async findByToken(token: string): Promise<IWebhook | null> {
        return await Webhook.findOne({ token }).lean();
    }

    async findByServerId(serverId: string): Promise<IWebhook[]> {
        return await Webhook.find({ serverId }).lean();
    }

    async findByChannelId(channelId: string): Promise<IWebhook[]> {
        return await Webhook.find({ channelId }).lean();
    }

    async create(data: {
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

    async update(
        id: string,
        data: Partial<IWebhook>,
    ): Promise<IWebhook | null> {
        return await Webhook.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    async delete(id: string): Promise<boolean> {
        const result = await Webhook.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }
}
