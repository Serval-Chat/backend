import { type QueryFilter, ClientSession } from 'mongoose';
import {
    IMessageRepository,
    IMessage,
    IMessageWithEditHistory,
} from '@/di/interfaces/IMessageRepository';
import {
    Message,
    type IMessageEditRevision,
    type IPoll,
} from '@/models/Message';
import { Reaction } from '@/models/Reaction';
import { injectable } from 'inversify';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import type { IMessageAttachment } from '@/models/Attachment';
import type { InteractionValue } from '@/types/interactions';
import { isValidSnowflakeId } from '@/utils/snowflake';
import { createTextPatch } from '@/utils/textPatch';

type PopulatedMessageDoc = IMessage & {
    repliedToMessage?: PopulatedMessageDoc;
    editHistory?: IMessageEditRevision[];
};

// Mongoose Message repository
@injectable()
export class MongooseMessageRepository implements IMessageRepository {
    private messageModel = Message;
    public constructor() {}

    private messageVisibilityFilter(
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): QueryFilter<IMessage> {
        if (includeDeleted !== true) {
            return { deletedAt: { $exists: false } };
        }
        if (deletedAfter !== undefined) {
            return {
                $or: [
                    { deletedAt: { $exists: false } },
                    { deletedAt: { $gt: deletedAfter } },
                ],
            };
        }
        return {};
    }

    private combineFilters(
        ...filters: QueryFilter<IMessage>[]
    ): QueryFilter<IMessage> {
        const nonEmpty = filters.filter(
            (filter) => Object.keys(filter).length > 0,
        );
        if (nonEmpty.length === 0) return {};
        if (nonEmpty.length === 1) return nonEmpty[0] as QueryFilter<IMessage>;
        return { $and: nonEmpty };
    }

    private isMessageVisible(
        message: IMessage,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): boolean {
        if (message.deletedAt === undefined) return true;
        return (
            includeDeleted === true &&
            (deletedAfter === undefined || message.deletedAt > deletedAfter)
        );
    }

    private transformMessage(
        msg: PopulatedMessageDoc,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): IMessage {
        const transformed = { ...msg } as IMessage;
        delete (transformed as Partial<PopulatedMessageDoc>).repliedToMessage;
        delete (transformed as Partial<PopulatedMessageDoc>).editHistory;

        if (
            msg.repliedToMessage &&
            this.isMessageVisible(
                msg.repliedToMessage,
                includeDeleted,
                deletedAfter,
            )
        ) {
            transformed.referenced_message = this.transformMessage(
                msg.repliedToMessage,
                includeDeleted,
                deletedAfter,
            );
        } else {
            delete transformed.referenced_message;
        }

        return transformed;
    }

    private async transformMessages(
        messages: PopulatedMessageDoc[],
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): Promise<IMessage[]> {
        const transformed = messages.map((msg) =>
            this.transformMessage(msg, includeDeleted, deletedAfter),
        );

        const replyToIds = transformed
            .filter(
                (m) =>
                    m.referenced_message === undefined &&
                    m.replyToId !== undefined,
            )
            .map((m) => m.replyToId as string);

        // Skip legacy replyToId lookup if all messages are modern (populated via repliedToMessageId)
        if (replyToIds.length === 0) return transformed;

        // Legacy replyToId references are only populated one level deep; nested replies within legacy messages will not have referenced_message set.
        const replyDocs = (await this.messageModel
            .find(
                this.combineFilters(
                    { snowflakeId: { $in: replyToIds } },
                    this.messageVisibilityFilter(includeDeleted, deletedAfter),
                ),
            )
            .lean()) as PopulatedMessageDoc[];
        const replyMap = new Map(
            replyDocs.map((d) => [
                d.snowflakeId,
                this.transformMessage(d, includeDeleted, deletedAfter),
            ]),
        );

        return transformed.map((m) => {
            if (
                m.referenced_message === undefined &&
                m.replyToId !== undefined
            ) {
                const ref = replyMap.get(m.replyToId);
                if (ref) {
                    return {
                        ...m,
                        referenced_message: ref,
                    };
                }
            }
            return m;
        });
    }

    public async findById(
        id: string,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): Promise<IMessage | null> {
        const filter = this.combineFilters(
            { snowflakeId: id },
            this.messageVisibilityFilter(includeDeleted, deletedAfter),
        );

        const msg = (await this.messageModel
            .findOne(filter)
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc | null;
        return msg
            ? this.transformMessage(msg, includeDeleted, deletedAfter)
            : null;
    }

    public async conversationExists(
        user1Id: string,
        user2Id: string,
    ): Promise<boolean> {
        const existing = await this.messageModel.exists({
            $or: [
                { senderId: user1Id, receiverId: user2Id },
                { senderId: user2Id, receiverId: user1Id },
            ],
        });
        return existing !== null;
    }

    // Find messages between two users with pagination
    public async findByConversation(
        user1Id: string,
        user2Id: string,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
    ): Promise<IMessage[]> {
        return this.findByQuery(
            {
                $or: [
                    { senderId: user1Id, receiverId: user2Id },
                    { senderId: user2Id, receiverId: user1Id },
                ],
            },
            limit,
            before,
            around,
            after,
        );
    }

    // Find messages in a channel with pagination
    public async findByChannelId(
        channelId: string,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): Promise<IMessage[]> {
        return this.findByQuery(
            { channelId },
            limit,
            before,
            around,
            after,
            includeDeleted,
            deletedAfter,
        );
    }

    public async findContextAround(
        channelId: string,
        messageId: string,
        beforeCount = 10,
        afterCount = 10,
        includeDeleted = false,
        deletedAfter?: Date,
    ): Promise<IMessageWithEditHistory[]> {
        const target = (await this.messageModel
            .findOne(
                this.combineFilters(
                    { channelId, snowflakeId: messageId },
                    this.messageVisibilityFilter(includeDeleted, deletedAfter),
                ),
            )
            .lean()) as PopulatedMessageDoc | null;
        if (target === null || target.createdAt === undefined) return [];

        const deletedFilter = this.messageVisibilityFilter(
            includeDeleted,
            deletedAfter,
        );
        const before = (await this.messageModel
            .find(
                this.combineFilters({ channelId }, deletedFilter, {
                    $or: [
                        { createdAt: { $lt: target.createdAt } },
                        {
                            createdAt: target.createdAt,
                            snowflakeId: { $lt: messageId },
                        },
                    ],
                }),
            )
            .sort({ createdAt: -1, snowflakeId: -1 })
            .limit(beforeCount)
            .lean()) as PopulatedMessageDoc[];
        const after = (await this.messageModel
            .find(
                this.combineFilters({ channelId }, deletedFilter, {
                    $or: [
                        { createdAt: { $gt: target.createdAt } },
                        {
                            createdAt: target.createdAt,
                            snowflakeId: { $gt: messageId },
                        },
                    ],
                }),
            )
            .sort({ createdAt: 1, snowflakeId: 1 })
            .limit(afterCount)
            .lean()) as PopulatedMessageDoc[];

        return [...before.reverse(), target, ...after].map((message) => ({
            ...this.transformMessage(message, includeDeleted, deletedAfter),
            editHistory: (message.editHistory ?? []).map((revision) =>
                'text' in revision
                    ? { text: revision.text, editedAt: revision.editedAt }
                    : {
                          start: revision.start,
                          removedText: revision.removedText,
                          insertedText: revision.insertedText,
                          editedAt: revision.editedAt,
                      },
            ),
        }));
    }

    private async findByQuery(
        baseQuery: QueryFilter<IMessage>,
        limit = 50,
        before?: string,
        around?: string,
        after?: string,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): Promise<IMessage[]> {
        const deletedFilter = this.messageVisibilityFilter(
            includeDeleted,
            deletedAfter,
        );

        if (around !== undefined && around !== '') {
            const targetFilter = this.combineFilters(
                { snowflakeId: around },
                deletedFilter,
            );
            const targetMessage = (await this.messageModel
                .findOne(targetFilter)
                .lean()) as PopulatedMessageDoc | null;
            if (!targetMessage) return [];

            const targetDate = targetMessage.createdAt;

            // Fetch messages before (older)
            const beforeQuery = this.combineFilters(baseQuery, deletedFilter, {
                createdAt: { $lt: targetDate },
            });
            const beforeMessages = (await this.messageModel
                .find(beforeQuery)
                .sort({ createdAt: -1 })
                .limit(Math.floor(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedMessageDoc[];

            const afterMessages = (await this.messageModel
                .find(
                    this.combineFilters(baseQuery, deletedFilter, {
                        createdAt: { $gte: targetDate },
                    }),
                )
                .sort({ createdAt: 1 }) // Ascending to get closest to target
                .limit(Math.ceil(limit / 2))
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedMessageDoc[];

            // Combine and sort chronologically
            const combined = [...beforeMessages, ...afterMessages].sort(
                (a, b) =>
                    (a.createdAt?.getTime() ?? 0) -
                    (b.createdAt?.getTime() ?? 0),
            );
            return await this.transformMessages(
                combined,
                includeDeleted,
                deletedAfter,
            );
        }

        let cursorFilter: QueryFilter<IMessage> = {};

        if (before !== undefined && before !== '') {
            if (isValidSnowflakeId(before)) {
                cursorFilter = { snowflakeId: { $lt: before } };
            } else {
                cursorFilter = { createdAt: { $lt: new Date(before) } };
            }
        } else if (after !== undefined && after !== '') {
            if (isValidSnowflakeId(after)) {
                cursorFilter = { snowflakeId: { $gt: after } };
            } else {
                cursorFilter = { createdAt: { $gt: new Date(after) } };
            }
        }

        const messages = (await this.messageModel
            .find(this.combineFilters(baseQuery, deletedFilter, cursorFilter))
            .sort({ createdAt: after !== undefined && after !== '' ? 1 : -1 })
            .limit(limit)
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc[];

        if (after === undefined || after === '') {
            messages.reverse();
        }

        return await this.transformMessages(
            messages,
            includeDeleted,
            deletedAfter,
        );
    }

    public findCursorByChannelId(
        channelId: string,
        deletedAfter?: Date,
    ): AsyncIterable<IMessage> {
        const visibility =
            deletedAfter === undefined
                ? {}
                : {
                      $or: [
                          { deletedAt: { $exists: false } },
                          { deletedAt: { $gt: deletedAfter } },
                      ],
                  };
        return this.messageModel
            .find(this.combineFilters({ channelId }, visibility))
            .sort({ createdAt: 1 })
            .lean()
            .cursor();
    }

    public async create(
        data: {
            senderId: string;
            channelId: string;
            serverId?: string;
            receiverId?: string;
            text?: string;
            isWebhook?: boolean;
            webhookUsername?: string;
            webhookAvatarUrl?: string;
            replyToId?: string;
            repliedToMessageId?: string;
            stickerId?: string;
            interaction?: {
                command: string;
                options: { name: string; value: InteractionValue }[];
                user: { id: string; username: string };
            };
            poll?: IPoll;
            embeds?: IEmbed[];
            components?: IEmbedButton[];
            attachments?: IMessageAttachment[];
            noEmbeds?: boolean;
            noEmbedsUrls?: string[];
        },
        session?: ClientSession,
    ): Promise<IMessage> {
        const message = new this.messageModel(data);
        const savedMessage = await message.save({ session });
        const msgObj = savedMessage.toObject({ transform: false });
        return this.transformMessage(msgObj);
    }

    private async updateText(
        id: string,
        text: string,
        data: Partial<IMessage> = {},
    ): Promise<IMessage | null> {
        const editedAt = data.editedAt ?? new Date();
        const additionalSet = Object.fromEntries(
            Object.entries(data)
                .filter(
                    ([key]) =>
                        key !== 'text' &&
                        key !== 'editedAt' &&
                        key !== 'isEdited',
                )
                .map(([key, value]) => [key, { $literal: value }]),
        );

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const current = await this.messageModel
                .findOne({ snowflakeId: id })
                .select({ text: 1 })
                .lean();
            if (current === null) return null;

            const previousText =
                typeof current.text === 'string' ? current.text : '';
            const filter: QueryFilter<IMessage> = {
                snowflakeId: id,
                ...(current.text !== undefined
                    ? { text: current.text }
                    : { text: { $exists: false } }),
            };
            const set: Record<string, unknown> = {
                ...additionalSet,
                text: { $literal: text },
                editedAt: { $literal: editedAt },
                isEdited: { $literal: true },
            };

            if (previousText !== text) {
                set.editHistory = {
                    $concatArrays: [
                        { $ifNull: ['$editHistory', []] },
                        [
                            {
                                $literal: {
                                    ...createTextPatch(previousText, text),
                                    editedAt,
                                },
                            },
                        ],
                    ],
                };
            }

            const msg = (await this.messageModel
                .findOneAndUpdate(filter, [{ $set: set }], {
                    returnDocument: 'after',
                    updatePipeline: true,
                })
                .populate({
                    path: 'repliedToMessage',
                    populate: { path: 'repliedToMessage' },
                })
                .lean()) as PopulatedMessageDoc | null;
            if (msg) return this.transformMessage(msg);
        }

        throw new Error(`Message ${id} changed too often to save its edit`);
    }

    public async update(id: string, text: string): Promise<IMessage | null> {
        return this.updateText(id, text);
    }

    public async updateMessage(
        id: string,
        data: Partial<IMessage>,
    ): Promise<IMessage | null> {
        if (data.text !== undefined) {
            return this.updateText(id, data.text, data);
        }
        const msg = (await this.messageModel
            .findOneAndUpdate({ snowflakeId: id }, data, {
                returnDocument: 'after',
            })
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc | null;
        return msg ? this.transformMessage(msg) : null;
    }

    public async setPollVote(
        id: string,
        userId: string,
        optionIds: string[],
    ): Promise<IMessage | null> {
        await this.messageModel.updateOne(
            { snowflakeId: id },
            {
                $pull: { 'poll.options.$[].votes': userId },
            },
        );
        if (optionIds.length > 0) {
            await this.messageModel.updateOne(
                { snowflakeId: id },
                {
                    $addToSet: { 'poll.options.$[opt].votes': userId },
                },
                { arrayFilters: [{ 'opt.id': { $in: optionIds } }] },
            );
        }
        return this.findById(id);
    }

    public async hardDelete(id: string): Promise<boolean> {
        const result = await this.messageModel.deleteOne({
            snowflakeId: id,
        });
        return result.deletedCount > 0;
    }

    public async softDelete(id: string): Promise<boolean> {
        const result = await this.messageModel.updateOne(
            { snowflakeId: id },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount > 0;
    }

    public async bulkSoftDelete(
        channelId: string,
        ids: string[],
    ): Promise<number> {
        const result = await this.messageModel.updateMany(
            {
                channelId: channelId,
                snowflakeId: { $in: ids },
                deletedAt: { $exists: false },
            },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount;
    }

    public async findNonDeletedIdsByChannelId(
        channelId: string,
        ids: string[],
    ): Promise<string[]> {
        const messages = await this.messageModel
            .find({
                channelId,
                snowflakeId: { $in: ids },
                deletedAt: { $exists: false },
            })
            .select({ snowflakeId: 1 })
            .lean();
        return messages.map((message) => message.snowflakeId);
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await this.messageModel.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async hardDeleteDeletedByServerId(
        serverId: string,
    ): Promise<number> {
        const filter = { serverId, deletedAt: { $exists: true } };
        const messages = await this.messageModel
            .find(filter)
            .select({ snowflakeId: 1 })
            .lean();
        if (messages.length > 0) {
            await Reaction.deleteMany({
                messageType: 'server',
                messageId: { $in: messages.map((m) => m.snowflakeId) },
            });
        }
        const result = await this.messageModel.deleteMany(filter);
        return result.deletedCount;
    }

    public async deleteByChannelId(channelId: string): Promise<number> {
        const result = await this.messageModel.deleteMany({ channelId });
        return result.deletedCount;
    }

    public async softDeleteByAuthorAfter(
        serverId: string,
        senderId: string,
        after: Date,
    ): Promise<number> {
        const result = await this.messageModel.updateMany(
            {
                serverId,
                senderId,
                createdAt: { $gte: after },
                deletedAt: { $exists: false },
            },
            { $set: { deletedAt: new Date() } },
        );
        return result.modifiedCount;
    }

    public async updateManyBySenderId(
        senderId: string,
        update: {
            senderDeleted?: boolean;
            anonymizedSender?: string;
        },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany(
            { senderId },
            { $set: update },
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async updateManyByReceiverId(
        receiverId: string,
        update: { receiverDeleted?: boolean; anonymizedReceiver?: string },
    ): Promise<{ modifiedCount: number }> {
        const result = await this.messageModel.updateMany(
            { receiverId },
            update,
        );
        return { modifiedCount: result.modifiedCount };
    }

    public async countByChannelId(
        channelId: string,
        includeDeleted?: boolean,
    ): Promise<number> {
        const filter = this.combineFilters(
            { channelId },
            this.messageVisibilityFilter(includeDeleted),
        );
        return await this.messageModel.countDocuments(filter);
    }

    public async countByServerId(serverId: string): Promise<number> {
        return await this.messageModel.countDocuments({ serverId });
    }

    public async findLastByChannelAndUser(
        channelId: string,
        userId: string,
        includeDeleted?: boolean,
    ): Promise<IMessage | null> {
        const filter: QueryFilter<IMessage> = {
            channelId,
            senderId: userId,
            ...this.messageVisibilityFilter(includeDeleted),
        };
        const doc = (await this.messageModel
            .findOne(filter)
            .sort({ createdAt: -1 })
            .lean()) as PopulatedMessageDoc | null;
        return doc ? this.transformMessage(doc) : null;
    }

    public async findPinnedByChannelId(
        channelId: string,
        includeDeleted?: boolean,
        deletedAfter?: Date,
    ): Promise<IMessage[]> {
        const filter = this.combineFilters(
            { channelId },
            { $or: [{ isPinned: true }, { isSticky: true }] },
            this.messageVisibilityFilter(includeDeleted, deletedAfter),
        );
        const messages = (await this.messageModel
            .find(filter)
            .sort({ createdAt: -1 })
            .populate({
                path: 'repliedToMessage',
                populate: { path: 'repliedToMessage' },
            })
            .lean()) as PopulatedMessageDoc[];
        if (messages.length === 0) return [];
        return await this.transformMessages(
            messages,
            includeDeleted,
            deletedAfter,
        );
    }

    public async count(): Promise<number> {
        return await this.messageModel.countDocuments();
    }

    public async countCreatedAfter(date: Date): Promise<number> {
        return await this.messageModel.countDocuments({
            createdAt: { $gt: date },
        });
    }

    public async countByHour(since: Date, hours: number): Promise<number[]> {
        const msPerHour = 1000 * 60 * 60;
        const buckets = await this.messageModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerHour,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(hours).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < hours) result[idx] = b.count;
        }
        return result;
    }

    public async countByDay(since: Date, days: number): Promise<number[]> {
        if (days <= 0 || !Number.isFinite(days) || days > 10000) {
            return [];
        }

        const msPerDay = 1000 * 60 * 60 * 24;
        const buckets = await this.messageModel.aggregate<{
            _id: number;
            count: number;
        }>([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: ['$createdAt', since] },
                                msPerDay,
                            ],
                        },
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const result = Array<number>(days).fill(0);
        for (const b of buckets) {
            const idx = Math.floor(b._id);
            if (idx >= 0 && idx < days) result[idx] = b.count;
        }
        return result;
    }

    public async countAllByDay(): Promise<number[]> {
        const oldestMessage = await this.messageModel
            .findOne()
            .sort({ createdAt: 1 })
            .lean();
        if (!oldestMessage) return [];

        const now = new Date();
        const startOfOldestDay = new Date(oldestMessage.createdAt);
        startOfOldestDay.setHours(0, 0, 0, 0);

        const diffTime = Math.abs(now.getTime() - startOfOldestDay.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return this.countByDay(startOfOldestDay, days);
    }
}
