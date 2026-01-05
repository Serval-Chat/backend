import type { Types } from 'mongoose';

// Webhook interface (domain model)
//
// Represents an automated message sender for a specific channel
export interface IWebhook {
    _id: Types.ObjectId | string;
    serverId: Types.ObjectId | string;
    channelId: Types.ObjectId | string;
    name: string;
    // Secret token used to authenticate and send messages using the webhook
    token: string;
    avatarUrl?: string;
    createdBy: string;
    createdAt?: Date;
}

// Webhook Repository Interface
//
// Encapsulates webhook operations
export interface IWebhookRepository {
    // Find webhook by ID
    findById(id: string): Promise<IWebhook | null>;

    // Find webhook by token
    findByToken(token: string): Promise<IWebhook | null>;

    // Find all webhooks for a server
    findByServerId(serverId: string): Promise<IWebhook[]>;

    // Find all webhooks for a channel
    findByChannelId(channelId: string): Promise<IWebhook[]>;

    // Create a new webhook
    create(data: {
        serverId: string;
        channelId: string;
        name: string;
        token: string;
        avatarUrl?: string;
        createdBy: string;
    }): Promise<IWebhook>;

    // Update webhook
    update(id: string, data: Partial<IWebhook>): Promise<IWebhook | null>;

    // Delete webhook by ID
    delete(id: string): Promise<boolean>;
}
