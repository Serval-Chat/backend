import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Types } from 'mongoose';
import type { RawData } from 'ws';

import { JWT_SECRET } from '../../src/config/env';
import { setup, teardown } from './setup';
import {
    clearDatabase,
    createTestChannel,
    createTestServer,
    createTestUser,
} from './helpers';
import { Bot, DEFAULT_BOT_PERMISSIONS } from '../../src/models/Bot';
import { Role, ServerMember, ServerMessage } from '../../src/models/Server';
import { SlashCommand } from '../../src/models/SlashCommand';

type WsEnvelope = {
    id: string;
    event: {
        type: string;
        payload: Record<string, unknown>;
    };
    meta?: {
        ts?: number;
    };
};

type WsReceivedEnvelope = {
    id: string;
    event: {
        type: string;
        payload: Record<string, unknown>;
    };
    meta?: {
        replyTo?: string;
        ts?: number;
    };
};

const WS_EVENT_TIMEOUT_MS = 5000;
const WS_NO_EVENT_WINDOW_MS = 600;

function makeAccessToken(user: {
    _id: Types.ObjectId;
    login: string;
    username: string;
    tokenVersion?: number;
    isBot?: boolean;
}) {
    return jwt.sign(
        {
            id: user._id.toString(),
            login: user.login,
            username: user.username,
            tokenVersion: user.tokenVersion ?? 0,
            isBot: user.isBot === true,
            type: 'access',
        },
        JWT_SECRET,
        { expiresIn: '1h' },
    );
}

function wsUrlFromServer(server: Server): string {
    const address = server.address() as AddressInfo;
    return `ws://127.0.0.1:${address.port}/ws`;
}

function sendWsEvent(
    ws: WebSocket,
    type: string,
    payload: Record<string, unknown>,
): string {
    const envelope: WsEnvelope = {
        id: crypto.randomUUID(),
        event: { type, payload },
        meta: { ts: Date.now() },
    };
    ws.send(JSON.stringify(envelope));
    return envelope.id;
}

async function waitForWsEvent(
    ws: WebSocket,
    eventType: string,
    timeoutMs = WS_EVENT_TIMEOUT_MS,
): Promise<WsReceivedEnvelope> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', onMessage);
            reject(new Error(`Timed out waiting for ${eventType}`));
        }, timeoutMs);

        const onMessage = (raw: RawData) => {
            try {
                const parsed = JSON.parse(raw.toString()) as WsReceivedEnvelope;
                if (parsed.event.type === eventType) {
                    clearTimeout(timeout);
                    ws.removeListener('message', onMessage);
                    resolve(parsed);
                }
            } catch {
            }
        };

        ws.on('message', onMessage);
    });
}

async function waitForNoWsEvent(
    ws: WebSocket,
    eventType: string,
    windowMs = WS_NO_EVENT_WINDOW_MS,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const onMessage = (raw: RawData) => {
            try {
                const parsed = JSON.parse(raw.toString()) as WsReceivedEnvelope;
                if (parsed.event.type === eventType) {
                    cleanup();
                    reject(new Error(`Unexpected ${eventType} received`));
                }
            } catch {
            }
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, windowMs);

        const cleanup = () => {
            clearTimeout(timer);
            ws.removeListener('message', onMessage);
        };

        ws.on('message', onMessage);
    });
}

async function openAuthenticatedSocket(url: string, token: string): Promise<WebSocket> {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.once('open', () => resolve(socket));
        socket.once('error', (err) => reject(err));
    });

    const authRequestId = sendWsEvent(ws, 'authenticate', { token });
    const authenticated = await waitForWsEvent(ws, 'authenticated');
    expect(authenticated.meta?.replyTo).toBe(authRequestId);

    return ws;
}

import type { Express } from 'express';

describe('WS bot implicit event delivery', () => {
    let app: Express;
    let server: Server;
    let wsUrl: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;
        server = result.server;
        wsUrl = wsUrlFromServer(server);
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    it('delivers server message events to bot without join_channel', async () => {
        const owner = await createTestUser({ username: 'owner_ws_msg', login: 'owner_ws_msg' });
        const human = await createTestUser({ username: 'human_ws_msg', login: 'human_ws_msg' });
        const botUser = await createTestUser({ username: 'bot_ws_msg', login: 'bot_ws_msg', isBot: true });

        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());
        await ServerMember.create({ serverId: serverDoc._id, userId: human._id, roles: [] });
        await ServerMember.create({ serverId: serverDoc._id, userId: botUser._id, roles: [] });

        const botSocket = await openAuthenticatedSocket(
            wsUrl,
            makeAccessToken(botUser),
        );

        const httpMessageEventPromise = waitForWsEvent(botSocket, 'message_server');
        const humanToken = makeAccessToken(human);
        const httpRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ text: 'hello from api' });

        expect(httpRes.status).toBe(201);
        const httpMessageEvent = await httpMessageEventPromise;
        expect(httpMessageEvent.event.payload.text).toBe('hello from api');

        botSocket.close();
    });

    it('delivers interaction_create_server to bot without explicit join_server', async () => {
        const owner = await createTestUser({ username: 'owner_ws_interaction', login: 'owner_ws_interaction' });
        const human = await createTestUser({ username: 'human_ws_interaction', login: 'human_ws_interaction' });
        const botUser = await createTestUser({
            username: 'bot_ws_interaction',
            login: 'bot_ws_interaction',
            isBot: true,
        });

        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());
        await ServerMember.create({ serverId: serverDoc._id, userId: human._id, roles: [] });
        await ServerMember.create({ serverId: serverDoc._id, userId: botUser._id, roles: [] });

        const botDoc = await Bot.create({
            clientId: `cid_${Date.now()}`,
            clientSecretHash: crypto.createHash('sha256').update('secret').digest('hex'),
            ownerId: owner._id,
            userId: botUser._id,
            botPermissions: { ...DEFAULT_BOT_PERMISSIONS, joinServers: true },
        });

        await SlashCommand.create({
            botId: botDoc._id,
            name: 'ping',
            description: 'Ping command',
            options: [],
            shouldReply: false,
        });

        const botSocket = await openAuthenticatedSocket(wsUrl, makeAccessToken(botUser));

        const interactionEventPromise = waitForWsEvent(botSocket, 'interaction_create_server');
        const humanToken = makeAccessToken(human);
        const interactionRes = await request(app)
            .post('/api/v1/interactions')
            .set('Authorization', `Bearer ${humanToken}`)
            .send({
                command: 'ping',
                options: [],
                serverId: serverDoc._id.toString(),
                channelId: channelDoc._id.toString(),
            });

        expect(interactionRes.status).toBe(200);
        const interactionEvent = await interactionEventPromise;
        expect(interactionEvent.event.payload.command).toBe('ping');
        expect(interactionEvent.event.payload.serverId).toBe(serverDoc._id.toString());
        expect(interactionEvent.event.payload.channelId).toBe(channelDoc._id.toString());

        botSocket.close();
    });

    it('delivers webhook and reaction events to bot without join_channel', async () => {
        const owner = await createTestUser({ username: 'owner_ws_react', login: 'owner_ws_react' });
        const human = await createTestUser({ username: 'human_ws_react', login: 'human_ws_react' });
        const botUser = await createTestUser({ username: 'bot_ws_react', login: 'bot_ws_react', isBot: true });

        const ownerToken = makeAccessToken(owner);
        const humanToken = makeAccessToken(human);

        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());
        await ServerMember.create({ serverId: serverDoc._id, userId: human._id, roles: [] });
        await ServerMember.create({ serverId: serverDoc._id, userId: botUser._id, roles: [] });

        const botSocket = await openAuthenticatedSocket(
            wsUrl,
            makeAccessToken(botUser),
        );

        const webhookCreateRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/webhooks`,
            )
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'alerts-webhook' });
        expect(webhookCreateRes.status).toBe(201);
        const webhookToken = webhookCreateRes.body.token as string;

        const webhookEventPromise = waitForWsEvent(botSocket, 'message_server');
        const webhookExecuteRes = await request(app)
            .post(`/api/v1/webhooks/${webhookToken}`)
            .send({ content: 'from webhook' });
        expect(webhookExecuteRes.status).toBe(201);

        const webhookEvent = await webhookEventPromise;
        expect(webhookEvent.event.payload.text).toBe('from webhook');
        expect(webhookEvent.event.payload.isWebhook).toBe(true);

        const sendMessageRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ text: 'react to this' });
        expect(sendMessageRes.status).toBe(201);
        const messageId = sendMessageRes.body._id as string;

        const reactionAddedPromise = waitForWsEvent(botSocket, 'reaction_added');
        const addReactionRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages/${messageId}/reactions`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ emoji: '🔥', emojiType: 'unicode' });
        expect(addReactionRes.status).toBe(201);
        const reactionAdded = await reactionAddedPromise;
        expect(reactionAdded.event.payload.messageId).toBe(messageId);
        expect(reactionAdded.event.payload.channelId).toBe(channelDoc._id.toString());

        const reactionRemovedPromise = waitForWsEvent(botSocket, 'reaction_removed');
        const removeReactionRes = await request(app)
            .delete(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages/${messageId}/reactions`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ emoji: '🔥', scope: 'me' });
        expect(removeReactionRes.status).toBe(200);
        const reactionRemoved = await reactionRemovedPromise;
        expect(reactionRemoved.event.payload.messageId).toBe(messageId);
        expect(reactionRemoved.event.payload.channelId).toBe(channelDoc._id.toString());

        botSocket.close();
    });

    it('does not deliver server events to bot without viewChannels permission', async () => {
        const owner = await createTestUser({ username: 'owner_ws_no_view', login: 'owner_ws_no_view' });
        const human = await createTestUser({ username: 'human_ws_no_view', login: 'human_ws_no_view' });
        const botUser = await createTestUser({ username: 'bot_ws_no_view', login: 'bot_ws_no_view', isBot: true });

        const humanToken = makeAccessToken(human);
        const ownerToken = makeAccessToken(owner);

        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());
        await ServerMember.create({ serverId: serverDoc._id, userId: human._id, roles: [] });
        const botMember = await ServerMember.create({
            serverId: serverDoc._id,
            userId: botUser._id,
            roles: [],
        });

        const denyRole = await Role.create({
            serverId: serverDoc._id,
            name: 'deny-view-bot',
            position: 10,
            permissions: {
                sendMessages: true,
                manageMessages: false,
                deleteMessagesOfOthers: false,
                manageChannels: false,
                manageRoles: false,
                banMembers: false,
                kickMembers: false,
                manageInvites: false,
                manageServer: false,
                administrator: false,
                manageWebhooks: false,
                pingRolesAndEveryone: false,
                manageReactions: false,
                addReactions: true,
                viewChannels: false,
                pinMessages: false,
                seeDeletedMessages: false,
                connect: true,
            },
            managed: false,
        });
        botMember.roles = [denyRole._id];
        await botMember.save();

        const botSocket = await openAuthenticatedSocket(wsUrl, makeAccessToken(botUser));

        const sendRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ text: 'hidden from bot' });
        expect(sendRes.status).toBe(201);

        await waitForNoWsEvent(botSocket, 'message_server');

        const webhookCreateRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/webhooks`,
            )
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'deny-hook' });
        expect(webhookCreateRes.status).toBe(201);
        const webhookToken = webhookCreateRes.body.token as string;

        const webhookExecuteRes = await request(app)
            .post(`/api/v1/webhooks/${webhookToken}`)
            .send({ content: 'hidden webhook' });
        expect(webhookExecuteRes.status).toBe(201);

        await waitForNoWsEvent(botSocket, 'message_server');

        const publicMessage = await ServerMessage.findOne({
            channelId: channelDoc._id,
            text: 'hidden from bot',
        }).lean();
        expect(publicMessage).toBeTruthy();

        const addReactionRes = await request(app)
            .post(
                `/api/v1/servers/${serverDoc._id.toString()}/channels/${channelDoc._id.toString()}/messages/${publicMessage?._id.toString()}/reactions`,
            )
            .set('Authorization', `Bearer ${humanToken}`)
            .send({ emoji: '👀', emojiType: 'unicode' });
        expect(addReactionRes.status).toBe(201);

        await waitForNoWsEvent(botSocket, 'reaction_added');

        botSocket.close();
    });
});
