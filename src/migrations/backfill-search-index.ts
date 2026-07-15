import mongoose, { type Types } from 'mongoose';

import { Client } from '@elastic/elasticsearch';

import { connectDB } from '@/config/db';
import { ELASTICSEARCH_URL } from '@/config/env';
import { SYSTEM_SENDER_ID } from '@/utils/snowflake';
import {
    CHANNEL_MESSAGES_INDEX,
    CHANNEL_INDEX_MAPPINGS,
    DM_MESSAGES_INDEX,
    DM_INDEX_MAPPINGS,
} from '@/services/MessageSearchService';

// raw document shapes

interface RawDmMessage {
    _id: Types.ObjectId;
    snowflakeId?: string;
    senderId?: Types.ObjectId;
    receiverId?: Types.ObjectId;
    text?: string;
    createdAt?: Date;
    senderDeleted?: boolean;
    receiverDeleted?: boolean;
    stickerId?: string;
    embeds?: unknown[];
    attachments?: unknown[];
}

interface RawChannelMessage {
    _id: Types.ObjectId;
    snowflakeId?: string;
    senderId?: Types.ObjectId;
    serverId?: Types.ObjectId;
    channelId?: Types.ObjectId;
    text?: string;
    createdAt?: Date;
    deletedAt?: Date;
    isPinned?: boolean;
    isSticky?: boolean;
    isWebhook?: boolean;
    webhookUsername?: string;
    webhookAvatarUrl?: string;
    stickerId?: string;
    embeds?: unknown[];
    attachments?: unknown[];
}

// helpers shared with MessageSearchService (duplicated to avoid runtime import)

const URL_RE = /https?:\/\/\S+/i;
const MENTION_RE = /<userid:'([a-f0-9]{24})'>/gi;

function extractMentions(text: string): string[] {
    const ids: string[] = [];
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(text)) !== null) ids.push(m[1] ?? '');
    return ids;
}

// batch helpers

const BATCH_SIZE = 500;

async function bulkIndexDm(
    client: Client,
    docs: RawDmMessage[],
    botIds: Set<string>,
): Promise<{ ok: number; err: number; skipped: number }> {
    const indexable = docs.filter(
        (
            d,
        ): d is RawDmMessage & {
            snowflakeId: string;
            senderId: Types.ObjectId;
            receiverId: Types.ObjectId;
        } =>
            d.snowflakeId !== undefined &&
            d.snowflakeId !== '' &&
            d.senderId !== undefined &&
            d.receiverId !== undefined,
    );
    const skipped = docs.length - indexable.length;
    if (indexable.length === 0) return { ok: 0, err: 0, skipped };

    const operations = indexable.flatMap((doc) => {
        const text = doc.text ?? '';
        return [
            {
                index: {
                    _index: DM_MESSAGES_INDEX,
                    _id: doc.snowflakeId,
                },
            },
            {
                id: doc.snowflakeId,
                senderId: doc.senderId.toString(),
                receiverId: doc.receiverId.toString(),
                text,
                createdAt: (doc.createdAt ?? new Date()).toISOString(),
                senderDeleted: doc.senderDeleted ?? false,
                receiverDeleted: doc.receiverDeleted ?? false,
                is_pinned: false,
                is_sticky: false,
                is_webhook: false,
                is_bot: botIds.has(doc.senderId.toString()),
                has_file:
                    Array.isArray(doc.attachments) &&
                    doc.attachments.length > 0,
                has_embed: Array.isArray(doc.embeds) && doc.embeds.length > 0,
                has_link: URL_RE.test(text),
                mentions: extractMentions(text),
                embeds: doc.embeds ?? [],
                webhookUsername: undefined,
                webhookAvatarUrl: undefined,
                stickerId: doc.stickerId?.toString(),
            },
        ];
    });

    const response = await client.bulk({ operations, refresh: false });
    const errors = response.items.filter((i) => i.index?.error).length;
    return { ok: indexable.length - errors, err: errors, skipped };
}

async function bulkIndexChannel(
    client: Client,
    docs: RawChannelMessage[],
    botIds: Set<string>,
): Promise<{ ok: number; err: number; skipped: number }> {
    const indexable = docs.filter(
        (
            d,
        ): d is RawChannelMessage & {
            snowflakeId: string;
            senderId: Types.ObjectId;
            channelId: Types.ObjectId;
            serverId: Types.ObjectId;
        } =>
            d.snowflakeId !== undefined &&
            d.snowflakeId !== '' &&
            d.senderId !== undefined &&
            d.channelId !== undefined &&
            d.serverId !== undefined,
    );
    const skipped = docs.length - indexable.length;
    if (indexable.length === 0) return { ok: 0, err: 0, skipped };

    const operations = indexable.flatMap((doc) => {
        const text = doc.text ?? '';
        return [
            {
                index: {
                    _index: CHANNEL_MESSAGES_INDEX,
                    _id: doc.snowflakeId,
                },
            },
            {
                id: doc.snowflakeId,
                senderId: doc.senderId.toString(),
                channelId: doc.channelId.toString(),
                serverId: doc.serverId.toString(),
                text,
                createdAt: (doc.createdAt ?? new Date()).toISOString(),
                isDeleted: false,
                is_pinned: doc.isPinned ?? false,
                is_sticky: doc.isSticky ?? false,
                is_webhook:
                    (doc.isWebhook ?? false) ||
                    // ObjectId-shaped sentinel predating the snowflake migration, kept
                    // so re-running this backfill on old data still classifies webhook messages.
                    doc.senderId.toString() === '000000000000000000000000' ||
                    doc.senderId.toString() === SYSTEM_SENDER_ID,
                is_bot: botIds.has(doc.senderId.toString()),
                has_file:
                    Array.isArray(doc.attachments) &&
                    doc.attachments.length > 0,
                has_embed: Array.isArray(doc.embeds) && doc.embeds.length > 0,
                has_link: URL_RE.test(text),
                mentions: extractMentions(text),
                embeds: doc.embeds ?? [],
                webhookUsername: doc.webhookUsername,
                webhookAvatarUrl: doc.webhookAvatarUrl,
                stickerId: doc.stickerId?.toString(),
            },
        ];
    });

    const response = await client.bulk({ operations, refresh: false });
    const errors = response.items.filter((i) => i.index?.error).length;
    return { ok: indexable.length - errors, err: errors, skipped };
}

// per-collection backfill

async function backfillDmMessages(
    client: Client,
    botIds: Set<string>,
): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');

    const collection = db.collection<RawDmMessage>('messages');
    const total = await collection.countDocuments();
    console.log(`[backfill] DM messages: ${total} in collection`);

    let indexed = 0,
        skipped = 0,
        errors = 0;
    let batch: RawDmMessage[] = [];

    const cursor = collection.find({}).batchSize(BATCH_SIZE);

    for await (const doc of cursor) {
        if (doc.senderDeleted === true && doc.receiverDeleted === true) {
            skipped++;
            continue;
        }
        batch.push(doc);

        if (batch.length >= BATCH_SIZE) {
            const r = await bulkIndexDm(client, batch, botIds);
            indexed += r.ok;
            skipped += r.skipped;
            errors += r.err;
            batch = [];
            console.log(
                `[backfill] DM progress: ${indexed + skipped + errors}/${total} (indexed=${indexed}, skipped=${skipped}, errors=${errors})`,
            );
        }
    }

    if (batch.length > 0) {
        const r = await bulkIndexDm(client, batch, botIds);
        indexed += r.ok;
        skipped += r.skipped;
        errors += r.err;
    }

    console.log(
        `[backfill] DM done  -  indexed: ${indexed}, skipped: ${skipped}, errors: ${errors}`,
    );
}

async function backfillChannelMessages(
    client: Client,
    botIds: Set<string>,
): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');

    const collection = db.collection<RawChannelMessage>('servermessages');
    const total = await collection.countDocuments({
        deletedAt: { $exists: false },
    });
    const totalDeleted = await collection.countDocuments({
        deletedAt: { $exists: true },
    });
    console.log(
        `[backfill] Channel messages: ${total} to index, ${totalDeleted} deleted (skipping)`,
    );

    let indexed = 0,
        skipped = 0,
        errors = 0;
    let batch: RawChannelMessage[] = [];

    const cursor = collection
        .find({ deletedAt: { $exists: false } })
        .batchSize(BATCH_SIZE);

    for await (const doc of cursor) {
        batch.push(doc);

        if (batch.length >= BATCH_SIZE) {
            const r = await bulkIndexChannel(client, batch, botIds);
            indexed += r.ok;
            skipped += r.skipped;
            errors += r.err;
            batch = [];
            console.log(
                `[backfill] Channel progress: ${indexed + skipped + errors}/${total} (indexed=${indexed}, skipped=${skipped}, errors=${errors})`,
            );
        }
    }

    if (batch.length > 0) {
        const r = await bulkIndexChannel(client, batch, botIds);
        indexed += r.ok;
        skipped += r.skipped;
        errors += r.err;
    }

    console.log(
        `[backfill] Channel done  -  indexed: ${indexed}, skipped: ${skipped}, errors: ${errors}`,
    );
}

// entry point

export async function up(): Promise<void> {
    const client = new Client({
        node: ELASTICSEARCH_URL,
        requestTimeout: 30_000,
    });

    console.log('[backfill] Starting search index backfill...');
    console.log(`[backfill] ES: ${ELASTICSEARCH_URL}`);

    // delete existing indices so the new mapping takes effect cleanly
    console.log('[backfill] Deleting existing indices (if any)...');
    await client.indices.delete({
        index: [DM_MESSAGES_INDEX, CHANNEL_MESSAGES_INDEX],
        ignore_unavailable: true,
    });

    // recreate with updated mappings
    await client.indices.create({
        index: DM_MESSAGES_INDEX,
        mappings: DM_INDEX_MAPPINGS,
    });
    await client.indices.create({
        index: CHANNEL_MESSAGES_INDEX,
        mappings: CHANNEL_INDEX_MAPPINGS,
    });
    console.log('[backfill] Indices recreated with updated field mappings.');

    // one-shot bot user ID lookup
    const db = mongoose.connection.db;
    if (!db) throw new Error('No DB connection');
    const botDocs = await db
        .collection('users')
        .find({ isBot: true })
        .project({ _id: 1 })
        .toArray();
    const botIds = new Set(
        botDocs.map((u) => (u._id as Types.ObjectId).toString()),
    );
    console.log(`[backfill] Found ${botIds.size} bot user(s).`);

    await backfillDmMessages(client, botIds);
    await backfillChannelMessages(client, botIds);

    await client.indices.refresh({
        index: [DM_MESSAGES_INDEX, CHANNEL_MESSAGES_INDEX],
    });
    console.log('[backfill] Done. Both indexes refreshed and ready.');
}

if (require.main === module) {
    void (async () => {
        try {
            await connectDB();
            await up();
            await mongoose.disconnect();
            process.exit(0);
        } catch (err) {
            console.error('[backfill] Fatal error:', err);
            await mongoose.disconnect();
            process.exit(1);
        }
    })();
}

// run with:
// npx ts-node -r tsconfig-paths/register src/migrations/backfill-search-index.ts
