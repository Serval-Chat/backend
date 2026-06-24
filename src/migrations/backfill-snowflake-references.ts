import mongoose, { Types } from 'mongoose';

import { connectDB } from '@/config/db';

interface MigrationOptions {
    dryRun?: boolean;
    batchSize?: number;
}

interface FieldStats {
    remapped: number;
    unresolved: number;
}

const newStats = (): FieldStats => ({ remapped: 0, unresolved: 0 });

const HEX24 = /^[0-9a-fA-F]{24}$/;

const isLegacyId = (value: unknown): value is string | Types.ObjectId =>
    value instanceof Types.ObjectId ||
    (typeof value === 'string' && HEX24.test(value));

const legacyHex = (value: string | Types.ObjectId): string =>
    value instanceof Types.ObjectId ? value.toHexString() : value;

const getPath = (obj: unknown, path: string): unknown =>
    path
        .split('.')
        .reduce<unknown>(
            (acc, key) =>
                acc !== null && typeof acc === 'object'
                    ? (acc as Record<string, unknown>)[key]
                    : undefined,
            obj,
        );

const legacyMatch = (field: string): Record<string, unknown> => ({
    $or: [{ [field]: { $type: 'objectId' } }, { [field]: { $regex: HEX24 } }],
});

async function buildIdMap(
    collectionName: string,
): Promise<Map<string, string>> {
    const coll = mongoose.connection.collection(collectionName);
    const map = new Map<string, string>();
    const cursor = coll.find<{ _id: Types.ObjectId; snowflakeId: string }>(
        { snowflakeId: { $exists: true } },
        { projection: { _id: 1, snowflakeId: 1 } },
    );
    for await (const doc of cursor) {
        map.set(doc._id.toHexString(), doc.snowflakeId);
    }
    return map;
}

async function flush(
    coll: mongoose.mongo.Collection,
    ops: mongoose.mongo.AnyBulkWriteOperation[],
    options: MigrationOptions,
): Promise<void> {
    if (ops.length === 0) return;
    if (options.dryRun !== true) {
        await coll.bulkWrite(ops, { ordered: false });
    }
}

async function remapScalarField(
    collectionName: string,
    field: string,
    map: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const batchSize = options.batchSize ?? 500;
    const cursor = coll.find(legacyMatch(field), {
        projection: { _id: 1, [field]: 1 },
    });

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const raw = getPath(doc, field);
        if (!isLegacyId(raw)) continue;
        const mapped = map.get(legacyHex(raw));
        if (mapped === undefined) {
            stats.unresolved += 1;
            continue;
        }
        stats.remapped += 1;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { [field]: mapped } },
            },
        });
        if (ops.length >= batchSize) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapArrayField(
    collectionName: string,
    field: string,
    map: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const batchSize = options.batchSize ?? 500;
    const cursor = coll.find(
        { [`${field}.0`]: { $exists: true } },
        { projection: { _id: 1, [field]: 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const arr = getPath(doc, field);
        if (!Array.isArray(arr)) continue;
        const next = arr.map((item) => {
            if (!isLegacyId(item)) return item;
            const mapped = map.get(legacyHex(item));
            if (mapped === undefined) {
                stats.unresolved += 1;
                return item;
            }
            stats.remapped += 1;
            return mapped;
        });
        if (next.every((item, i) => item === arr[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { [field]: next } },
            },
        });
        if (ops.length >= batchSize) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapSubdocArrayField(
    collectionName: string,
    arrayField: string,
    subField: string,
    map: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const cursor = coll.find(
        { [`${arrayField}.0`]: { $exists: true } },
        { projection: { _id: 1, [arrayField]: 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const arr = getPath(doc, arrayField);
        if (!Array.isArray(arr)) continue;
        const next = arr.map((item: Record<string, unknown>) => {
            const value = item[subField];
            if (!isLegacyId(value)) return item;
            const mapped = map.get(legacyHex(value));
            if (mapped === undefined) {
                stats.unresolved += 1;
                return item;
            }
            stats.remapped += 1;
            return { ...item, [subField]: mapped };
        });
        if (next.every((item, i) => item === arr[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { [arrayField]: next } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapPollVotes(
    collectionName: string,
    usersMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const cursor = coll.find(
        { 'poll.options.0': { $exists: true } },
        { projection: { _id: 1, 'poll.options': 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const options_ = getPath(doc, 'poll.options');
        if (!Array.isArray(options_)) continue;
        const next = options_.map((opt: Record<string, unknown>) => {
            const votes = opt.votes;
            if (!Array.isArray(votes)) return opt;
            const nextVotes = votes.map((voterId) => {
                if (!isLegacyId(voterId)) return voterId;
                const mapped = usersMap.get(legacyHex(voterId));
                if (mapped === undefined) {
                    stats.unresolved += 1;
                    return voterId;
                }
                stats.remapped += 1;
                return mapped;
            });
            if (nextVotes.every((v, i) => v === votes[i])) return opt;
            return { ...opt, votes: nextVotes };
        });
        if (next.every((opt, i) => opt === options_[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { 'poll.options': next } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapMarkdownBlockadeRules(
    collectionName: string,
    usersMap: Map<string, string>,
    rolesMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const cursor = coll.find(
        { 'markdownBlockadeRules.0': { $exists: true } },
        { projection: { _id: 1, markdownBlockadeRules: 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const rules = getPath(doc, 'markdownBlockadeRules');
        if (!Array.isArray(rules)) continue;
        const next = rules.map(
            (rule: { targetType: string; targetId: unknown }) => {
                if (!isLegacyId(rule.targetId)) return rule;
                const map =
                    rule.targetType === 'role'
                        ? rolesMap
                        : rule.targetType === 'user'
                          ? usersMap
                          : null;
                if (map === null) return rule;
                const mapped = map.get(legacyHex(rule.targetId));
                if (mapped === undefined) {
                    stats.unresolved += 1;
                    return rule;
                }
                stats.remapped += 1;
                return { ...rule, targetId: mapped };
            },
        );
        if (next.every((rule, i) => rule === rules[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { markdownBlockadeRules: next } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapPingMessageId(
    usersMap: Map<string, string>,
    serversMap: Map<string, string>,
    channelsMap: Map<string, string>,
    messagesMap: Map<string, string>,
    serverMessagesMap: Map<string, string>,
    exportJobsMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection('pings');
    const stats = newStats();
    const cursor = coll.find(legacyMatch('messageId'), {
        projection: { _id: 1, messageId: 1, type: 1, serverId: 1 },
    });

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const raw = doc.messageId;
        if (!isLegacyId(raw)) continue;
        const targetMap =
            doc.type === 'export_status'
                ? exportJobsMap
                : isLegacyId(doc.serverId) || typeof doc.serverId === 'string'
                  ? serverMessagesMap
                  : messagesMap;
        const mapped = targetMap.get(legacyHex(raw));
        if (mapped === undefined) {
            stats.unresolved += 1;
            continue;
        }
        stats.remapped += 1;
        const messageMirrorField =
            doc.type === 'export_status' ? 'message.id' : 'message.messageId';
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: {
                    $set: { messageId: mapped, [messageMirrorField]: mapped },
                },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    void usersMap;
    void serversMap;
    void channelsMap;
    return stats;
}

async function remapReactionMessageId(
    messagesMap: Map<string, string>,
    serverMessagesMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection('reactions');
    const stats = newStats();
    const cursor = coll.find(legacyMatch('messageId'), {
        projection: { _id: 1, messageId: 1, messageType: 1 },
    });

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const raw = doc.messageId;
        if (!isLegacyId(raw)) continue;
        const targetMap =
            doc.messageType === 'server' ? serverMessagesMap : messagesMap;
        const mapped = targetMap.get(legacyHex(raw));
        if (mapped === undefined) {
            stats.unresolved += 1;
            continue;
        }
        stats.remapped += 1;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { messageId: mapped } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapServerSettingsOrder(
    serversMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection('users');
    const stats = newStats();
    const cursor = coll.find(
        { 'serverSettings.order.0': { $exists: true } },
        { projection: { _id: 1, 'serverSettings.order': 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const order = getPath(doc, 'serverSettings.order');
        if (!Array.isArray(order)) continue;
        const next = order.map((entry) => {
            if (isLegacyId(entry)) {
                const mapped = serversMap.get(legacyHex(entry));
                if (mapped === undefined) {
                    stats.unresolved += 1;
                    return entry;
                }
                stats.remapped += 1;
                return mapped;
            }
            if (
                entry === null ||
                typeof entry !== 'object' ||
                !Array.isArray((entry as { serverIds?: unknown }).serverIds)
            ) {
                return entry;
            }
            const folder = entry as { serverIds: unknown[] };
            const nextServerIds = folder.serverIds.map((serverId) => {
                if (!isLegacyId(serverId)) return serverId;
                const mapped = serversMap.get(legacyHex(serverId));
                if (mapped === undefined) {
                    stats.unresolved += 1;
                    return serverId;
                }
                stats.remapped += 1;
                return mapped;
            });
            if (nextServerIds.every((id, i) => id === folder.serverIds[i])) {
                return entry;
            }
            return { ...folder, serverIds: nextServerIds };
        });
        if (next.every((entry, i) => entry === order[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { 'serverSettings.order': next } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapInteractionOptionValues(
    usersMap: Map<string, string>,
    channelsMap: Map<string, string>,
    rolesMap: Map<string, string>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection('servermessages');
    const stats = newStats();
    const cursor = coll.find(
        { 'interaction.options.0': { $exists: true } },
        { projection: { _id: 1, 'interaction.options': 1 } },
    );

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const opts = getPath(doc, 'interaction.options');
        if (!Array.isArray(opts)) continue;
        const next = opts.map((opt: { name: string; value: unknown }) => {
            const value = opt.value;
            if (value === null || typeof value !== 'object') return opt;
            const resolved = value as {
                id?: unknown;
                username?: unknown;
                type?: unknown;
            };
            if (!isLegacyId(resolved.id)) return opt;
            const map =
                typeof resolved.username === 'string'
                    ? usersMap
                    : typeof resolved.type === 'string'
                      ? channelsMap
                      : rolesMap;
            const mapped = map.get(legacyHex(resolved.id));
            if (mapped === undefined) {
                stats.unresolved += 1;
                return opt;
            }
            stats.remapped += 1;
            return { ...opt, value: { ...resolved, id: mapped } };
        });
        if (next.every((opt, i) => opt === opts[i])) continue;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { 'interaction.options': next } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

async function remapPolymorphicTargetId(
    collectionName: string,
    typeToMap: Record<string, Map<string, string>>,
    options: MigrationOptions,
): Promise<FieldStats> {
    const coll = mongoose.connection.collection(collectionName);
    const stats = newStats();
    const cursor = coll.find(legacyMatch('targetId'), {
        projection: { _id: 1, targetId: 1, targetType: 1 },
    });

    let ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    for await (const doc of cursor) {
        const raw = doc.targetId;
        if (!isLegacyId(raw)) continue;
        const map =
            typeof doc.targetType === 'string'
                ? typeToMap[doc.targetType]
                : undefined;
        if (map === undefined) {
            stats.unresolved += 1;
            continue;
        }
        const mapped = map.get(legacyHex(raw));
        if (mapped === undefined) {
            stats.unresolved += 1;
            continue;
        }
        stats.remapped += 1;
        ops.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { targetId: mapped } },
            },
        });
        if (ops.length >= 500) {
            await flush(coll, ops, options);
            ops = [];
        }
    }
    await flush(coll, ops, options);
    return stats;
}

function printStats(label: string, stats: FieldStats, dryRun: boolean): void {
    if (stats.remapped === 0 && stats.unresolved === 0) return;
    const verb = dryRun ? 'would remap' : 'remapped';
    console.log(
        `  ${label}: ${verb} ${stats.remapped}` +
            (stats.unresolved > 0
                ? `, ${stats.unresolved} unresolved (dangling reference, left untouched)`
                : ''),
    );
}

export async function up(options: MigrationOptions = {}): Promise<void> {
    const dryRun = options.dryRun === true;

    console.log('Building reference id maps...');
    const usersMap = await buildIdMap('users');
    const serversMap = await buildIdMap('servers');
    const channelsMap = await buildIdMap('channels');
    const categoriesMap = await buildIdMap('categories');
    const rolesMap = await buildIdMap('roles');
    const messagesMap = await buildIdMap('messages');
    const serverMessagesMap = await buildIdMap('servermessages');
    const exportJobsMap = await buildIdMap('exportjobs');
    const stickersMap = await buildIdMap('stickers');
    const emojisMap = await buildIdMap('emojis');
    const blockProfilesMap = await buildIdMap('blockprofiles');
    const botsMap = await buildIdMap('bots');
    console.log(
        `  users=${usersMap.size} servers=${serversMap.size} channels=${channelsMap.size} ` +
            `categories=${categoriesMap.size} roles=${rolesMap.size} messages=${messagesMap.size} ` +
            `servermessages=${serverMessagesMap.size} exportjobs=${exportJobsMap.size} ` +
            `stickers=${stickersMap.size} emojis=${emojisMap.size} ` +
            `blockprofiles=${blockProfilesMap.size} bots=${botsMap.size}`,
    );

    type ScalarJob = [
        collection: string,
        field: string,
        map: Map<string, string>,
    ];
    const scalarJobs: ScalarJob[] = [
        ['servermembers', 'userId', usersMap],
        ['servermembers', 'serverId', serversMap],
        ['friendships', 'userId', usersMap],
        ['friendships', 'friendId', usersMap],
        ['friendrequests', 'fromId', usersMap],
        ['friendrequests', 'toId', usersMap],
        ['messages', 'senderId', usersMap],
        ['messages', 'receiverId', usersMap],
        ['messages', 'repliedToMessageId', messagesMap],
        ['messages', 'stickerId', stickersMap],
        ['servermessages', 'serverId', serversMap],
        ['servermessages', 'channelId', channelsMap],
        ['servermessages', 'senderId', usersMap],
        ['servermessages', 'repliedToMessageId', serverMessagesMap],
        ['servermessages', 'stickerId', stickersMap],
        ['servermessages', 'repliedTo.senderId', usersMap],
        ['servermessages', 'interaction.user.id', usersMap],
        ['channels', 'serverId', serversMap],
        ['channels', 'categoryId', categoriesMap],
        ['categories', 'serverId', serversMap],
        ['roles', 'serverId', serversMap],
        ['roles', 'managedBotId', botsMap],
        ['slashcommands', 'botId', botsMap],
        ['invites', 'serverId', serversMap],
        ['invites', 'createdByUserId', usersMap],
        ['serverbans', 'serverId', serversMap],
        ['serverbans', 'userId', usersMap],
        ['serverbans', 'bannedBy', usersMap],
        ['servers', 'ownerId', usersMap],
        ['servers', 'defaultRoleId', rolesMap],
        ['servers', 'onboarding.landingChannelId', channelsMap],
        ['bots', 'userId', usersMap],
        ['bots', 'ownerId', usersMap],
        ['blockprofiles', 'ownerId', usersMap],
        ['userblocks', 'blockerId', usersMap],
        ['userblocks', 'targetId', usersMap],
        ['userblocks', 'profileId', blockProfilesMap],
        ['bans', 'userId', usersMap],
        ['bans', 'issuedBy', usersMap],
        ['mutes', 'userId', usersMap],
        ['mutes', 'issuedBy', usersMap],
        ['warnings', 'userId', usersMap],
        ['warnings', 'issuedBy', usersMap],
        ['webhooks', 'serverId', serversMap],
        ['webhooks', 'channelId', channelsMap],
        ['webhooks', 'createdBy', usersMap],
        ['dmunreads', 'user', usersMap],
        ['dmunreads', 'peer', usersMap],
        ['serverchannelreads', 'userId', usersMap],
        ['serverchannelreads', 'serverId', serversMap],
        ['serverchannelreads', 'channelId', channelsMap],
        ['exportjobs', 'channelId', channelsMap],
        ['exportjobs', 'serverId', serversMap],
        ['exportjobs', 'requestedBy', usersMap],
        ['pushsubscriptions', 'userId', usersMap],
        ['passwordresets', 'userId', usersMap],
        ['totpusedcodes', 'userId', usersMap],
        ['userconnections', 'userId', usersMap],
        ['favoritegifs', 'userId', usersMap],
        ['emojis', 'serverId', serversMap],
        ['emojis', 'createdBy', usersMap],
        ['stickers', 'serverId', serversMap],
        ['stickers', 'createdBy', usersMap],
        ['auditlogs', 'actorId', usersMap],
        ['auditlogs', 'serverId', serversMap],
        ['auditlogs', 'targetUserId', usersMap],
        ['adminnotes', 'adminId', usersMap],
        ['adminnotes', 'deletedBy', usersMap],
        ['pings', 'userId', usersMap],
        ['pings', 'senderId', usersMap],
        ['pings', 'serverId', serversMap],
        ['pings', 'channelId', channelsMap],
        ['reactions', 'userId', usersMap],
        ['reactions', 'emojiId', emojisMap],
    ];

    type ArrayJob = [
        collection: string,
        field: string,
        map: Map<string, string>,
    ];
    const arrayJobs: ArrayJob[] = [
        ['servermembers', 'roles', rolesMap],
        ['servermembers', 'hiddenChannelIds', channelsMap],
        ['servermembers', 'hiddenCategoryIds', categoriesMap],
        ['servers', 'onboarding.selfAssignableRoleIds', rolesMap],
        ['servers', 'onboarding.welcomeChannelIds', channelsMap],
    ];

    console.log(`Remapping scalar fields...${dryRun ? ' [dry-run]' : ''}`);
    for (const [collection, field, map] of scalarJobs) {
        const stats = await remapScalarField(collection, field, map, options);
        printStats(`${collection}.${field}`, stats, dryRun);
    }

    console.log(`Remapping array fields...${dryRun ? ' [dry-run]' : ''}`);
    for (const [collection, field, map] of arrayJobs) {
        const stats = await remapArrayField(collection, field, map, options);
        printStats(`${collection}.${field}[]`, stats, dryRun);
    }

    console.log(
        `Remapping subdocument-array fields...${dryRun ? ' [dry-run]' : ''}`,
    );
    printStats(
        'bans.history[].issuedBy',
        await remapSubdocArrayField(
            'bans',
            'history',
            'issuedBy',
            usersMap,
            options,
        ),
        dryRun,
    );
    printStats(
        'mutes.history[].issuedBy',
        await remapSubdocArrayField(
            'mutes',
            'history',
            'issuedBy',
            usersMap,
            options,
        ),
        dryRun,
    );
    printStats(
        'adminnotes.history[].editorId',
        await remapSubdocArrayField(
            'adminnotes',
            'history',
            'editorId',
            usersMap,
            options,
        ),
        dryRun,
    );

    console.log(`Remapping poll votes...${dryRun ? ' [dry-run]' : ''}`);
    printStats(
        'messages.poll.options[].votes[]',
        await remapPollVotes('messages', usersMap, options),
        dryRun,
    );
    printStats(
        'servermessages.poll.options[].votes[]',
        await remapPollVotes('servermessages', usersMap, options),
        dryRun,
    );

    console.log(
        `Remapping markdownBlockadeRules...${dryRun ? ' [dry-run]' : ''}`,
    );
    for (const collection of ['servers', 'categories', 'channels']) {
        printStats(
            `${collection}.markdownBlockadeRules[].targetId`,
            await remapMarkdownBlockadeRules(
                collection,
                usersMap,
                rolesMap,
                options,
            ),
            dryRun,
        );
    }

    console.log(
        `Remapping polymorphic messageId fields...${dryRun ? ' [dry-run]' : ''}`,
    );
    printStats(
        'pings.messageId',
        await remapPingMessageId(
            usersMap,
            serversMap,
            channelsMap,
            messagesMap,
            serverMessagesMap,
            exportJobsMap,
            options,
        ),
        dryRun,
    );
    printStats(
        'reactions.messageId',
        await remapReactionMessageId(messagesMap, serverMessagesMap, options),
        dryRun,
    );

    console.log(
        `Remapping User.serverSettings.order (server folders)...${dryRun ? ' [dry-run]' : ''}`,
    );
    printStats(
        'users.serverSettings.order[]',
        await remapServerSettingsOrder(serversMap, options),
        dryRun,
    );

    console.log(
        `Remapping interaction option mention values...${dryRun ? ' [dry-run]' : ''}`,
    );
    printStats(
        'servermessages.interaction.options[].value.id',
        await remapInteractionOptionValues(
            usersMap,
            channelsMap,
            rolesMap,
            options,
        ),
        dryRun,
    );

    console.log(
        `Remapping polymorphic targetId fields...${dryRun ? ' [dry-run]' : ''}`,
    );
    printStats(
        'auditlogs.targetId',
        await remapPolymorphicTargetId(
            'auditlogs',
            {
                user: usersMap,
                server: serversMap,
                channel: channelsMap,
                category: categoriesMap,
                role: rolesMap,
                message: serverMessagesMap,
            },
            options,
        ),
        dryRun,
    );
    printStats(
        'adminnotes.targetId',
        await remapPolymorphicTargetId(
            'adminnotes',
            { User: usersMap, Server: serversMap },
            options,
        ),
        dryRun,
    );

    console.log('Done.');
}

if (require.main === module) {
    const action = process.argv[2];
    const dryRun = process.argv.includes('--dry-run');

    void (async () => {
        try {
            await connectDB();

            if (action === 'up') {
                await up({ dryRun });
            } else {
                console.error(
                    'Usage: ts-node -r tsconfig-paths/register src/migrations/backfill-snowflake-references.ts up [--dry-run]',
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
