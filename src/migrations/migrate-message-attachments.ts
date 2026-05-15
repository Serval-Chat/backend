import mongoose from 'mongoose';

import { SERVER_URL } from '@/config/env';
import { connectDB } from '@/config/db';
import type { IMessageAttachment } from '@/models/Attachment';
import { buildAttachmentMetadataFromUrl } from '@/utils/attachments';

const FILE_MARKER_RE = /\[%file%\]\(([^)]*)\)/g;

interface MessageDoc {
    _id: mongoose.Types.ObjectId;
    text?: string;
    attachments?: IMessageAttachment[];
}

interface MigrationOptions {
    dryRun?: boolean;
}

type SkipReason =
    | 'missing file'
    | 'unknown host'
    | 'unknown path'
    | 'invalid filename'
    | 'invalid URL';

function cleanMigratedText(text: string): string {
    return text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function getSkippableAttachmentReason(error: unknown): SkipReason | undefined {
    if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
    ) {
        return 'missing file';
    }

    if (error instanceof Error) {
        if (error.message.startsWith('Unknown attachment host:')) {
            return 'unknown host';
        }

        if (error.message.startsWith('Unknown attachment download path:')) {
            return 'unknown path';
        }

        if (error.message.startsWith('Invalid attachment filename:')) {
            return 'invalid filename';
        }

        if (error instanceof TypeError) {
            return 'invalid URL';
        }
    }

    return undefined;
}

function formatSkipReasons(skipReasons: Record<SkipReason, number>): string {
    const reasonParts = Object.entries(skipReasons)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `${reason}: ${count}`);

    return reasonParts.length > 0 ? ` (${reasonParts.join(', ')})` : '';
}

async function migrateCollection(
    collectionName: string,
    options: MigrationOptions,
): Promise<number> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const collection = db.collection<MessageDoc>(collectionName);
    const cursor = collection.find({ text: /\[%file%\]\(/ });
    let documentsWithMarkers = 0;
    let convertedDocuments = 0;
    let convertedAttachments = 0;
    let skippedMarkers = 0;
    const skipReasons: Record<SkipReason, number> = {
        'missing file': 0,
        'unknown host': 0,
        'unknown path': 0,
        'invalid filename': 0,
        'invalid URL': 0,
    };

    for await (const doc of cursor) {
        const text = doc.text ?? '';
        const markers = Array.from(text.matchAll(FILE_MARKER_RE));
        if (markers.length === 0) continue;

        documentsWithMarkers += 1;
        const converted: boolean[] = [];
        const nextAttachments: IMessageAttachment[] = [];
        let skipped = 0;

        for (const marker of markers) {
            const url = marker[1] ?? '';
            try {
                nextAttachments.push(await buildAttachmentMetadataFromUrl(url));
                converted.push(true);
            } catch (error) {
                const skipReason = getSkippableAttachmentReason(error);
                if (skipReason === undefined) {
                    throw error;
                }

                skipped += 1;
                skipReasons[skipReason] += 1;
                converted.push(false);
                const details =
                    error instanceof Error ? error.message : String(error);
                console.warn(
                    `[skip] ${collectionName}/${doc._id.toString()}: ${skipReason} for ${url} (${details})`,
                );
            }
        }

        skippedMarkers += skipped;
        convertedAttachments += nextAttachments.length;

        if (nextAttachments.length === 0) {
            if (options.dryRun === true && skipped > 0) {
                console.log(
                    `[dry-run] ${collectionName}/${doc._id.toString()}: 0 attachment(s), ${skipped} skipped`,
                );
            }
            continue;
        }

        let markerIndex = 0;
        const nextText = cleanMigratedText(
            text.replace(FILE_MARKER_RE, (match) =>
                converted[markerIndex++] === true ? '' : match,
            ),
        );

        const attachments = [...(doc.attachments ?? []), ...nextAttachments];

        convertedDocuments += 1;

        if (options.dryRun === true) {
            console.log(
                `[dry-run] ${collectionName}/${doc._id.toString()}: ${nextAttachments.length} attachment(s), ${skipped} skipped`,
            );
            continue;
        }

        await collection.updateOne(
            { _id: doc._id },
            {
                $set: {
                    text: nextText,
                    attachments,
                },
            },
        );
    }

    const skipReasonSummary = formatSkipReasons(skipReasons);

    console.log(
        options.dryRun === true
            ? `Dry run checked ${documentsWithMarkers} document(s) with legacy markers in ${collectionName}: ${convertedDocuments} would be updated, ${convertedAttachments} attachment(s) convertible, ${skippedMarkers} skipped marker(s)${skipReasonSummary}`
            : `Migrated ${convertedDocuments} document(s) in ${collectionName}: ${convertedAttachments} attachment(s) converted, ${skippedMarkers} skipped marker(s)${skipReasonSummary}, ${documentsWithMarkers} document(s) with legacy markers`,
    );

    return convertedDocuments;
}

async function rollbackCollection(
    collectionName: string,
    options: MigrationOptions,
): Promise<number> {
    const db = mongoose.connection.db;
    if (!db) {
        throw new Error('Database connection not established');
    }

    const baseUrl = SERVER_URL.replace(/\/$/, '');
    if (baseUrl === '') {
        throw new Error('SERVER_URL is required for rollback');
    }

    const collection = db.collection<MessageDoc>(collectionName);
    const cursor = collection.find({ attachments: { $exists: true, $ne: [] } });
    let rolledBack = 0;

    for await (const doc of cursor) {
        const attachments = doc.attachments ?? [];
        if (attachments.length === 0) continue;

        const markers = attachments.map((attachment) => {
            const url = `${baseUrl}/api/v1/files/download/${encodeURIComponent(attachment.attachmentId)}${attachment.spoiler === true ? '#spoiler' : ''}`;
            return `[%file%](${url})`;
        });
        const nextText = [doc.text ?? '', ...markers]
            .filter(Boolean)
            .join('\n');

        rolledBack += 1;

        if (options.dryRun === true) {
            console.log(
                `[dry-run] ${collectionName}/${doc._id.toString()}: ${attachments.length} attachment(s)`,
            );
            continue;
        }

        await collection.updateOne(
            { _id: doc._id },
            {
                $set: { text: nextText },
                $unset: { attachments: '' },
            },
        );
    }

    console.log(
        `${options.dryRun === true ? 'Dry run checked' : 'Rolled back'} ${rolledBack} document(s) in ${collectionName}`,
    );

    return rolledBack;
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    await migrateCollection('messages', options);
    await migrateCollection('servermessages', options);
}

export async function down(options: MigrationOptions = {}): Promise<void> {
    await rollbackCollection('messages', options);
    await rollbackCollection('servermessages', options);
}

if (require.main === module) {
    const action = process.argv[2];
    const dryRun = process.argv.includes('--dry-run');

    void (async () => {
        try {
            await connectDB();

            if (action === 'up') {
                await up({ dryRun });
            } else if (action === 'down') {
                await down({ dryRun });
            } else {
                console.error(
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/migrate-message-attachments.ts <up|down> [--dry-run]',
                );
                process.exit(1);
            }

            await mongoose.disconnect();
            process.exit(0);
        } catch (error) {
            console.error('Migration failed:', error);
            await mongoose.disconnect();
            process.exit(1);
        }
    })();
}
