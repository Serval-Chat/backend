/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RawData } from 'ws';
import type { Express } from 'express';

import { JWT_SECRET } from '../../src/config/env';
import { setup, teardown } from './setup';
import {
    clearDatabase,
    createTestChannel,
    createTestServer,
    createTestUser,
} from './helpers';
import { Webhook } from '../../src/models/Webhook';
import { TYPES } from '../../src/di/types';
import { container } from '../../src/di/container';
import { ServerMember } from '../../src/models/Server';

type WsReceivedEnvelope = {
    id: string;
    event: {
        type: string;
        payload: Record<string, any>;
    };
    meta?: {
        replyTo?: string;
        ts?: number;
    };
};

const WS_EVENT_TIMEOUT_MS = 5000;

function makeAccessToken(user: { _id: { toString(): string }, login: string, username: string, tokenVersion?: number, isBot?: boolean }) {
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
            } catch (err) {
            }
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

    const envelope = {
        id: crypto.randomUUID(),
        event: { type: 'authenticate', payload: { token } },
    };
    ws.send(JSON.stringify(envelope));
    await waitForWsEvent(ws, 'authenticated');

    return ws;
}

describe('Webhook Embed Updates Broadcast', () => {
    let app: Express;
    let server: Server;
    let wsUrl: string;

    const DISCORD_URL = 'https://cdn.discordapp.com/attachments/1477747168180699284/1505310160070115348/image.png?ex=6a0a28d5&is=6a08d755&hm=49ff464b0a9c8f8136373f643f7d15e9dec0db1273e764355642fb736c5c8aec&';

    beforeAll(async () => {
        container.rebind(TYPES.ScraperService).toConstantValue({
            scrape: async (url: string) => ({
                url: url,
                mimeType: 'image/png',
                title: 'image.png',
                image: '74ecdda484e669fa60c5986d2d426d8f.webp',
            }),
            onModuleInit: () => {},
            onModuleDestroy: () => {},
        });

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

    it('should broadcast message_server_embeds_updated to everyone in the channel when a webhook sends a link', async () => {
        const owner = await createTestUser({ username: 'owner', login: 'owner@test.com' });
        const viewer = await createTestUser({ username: 'viewer', login: 'viewer@test.com' });
        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());

        await ServerMember.create({ serverId: serverDoc._id, userId: viewer._id, roles: [] });

        const viewerToken = makeAccessToken(viewer);
        const viewerSocket = await openAuthenticatedSocket(wsUrl, viewerToken);

        viewerSocket.send(JSON.stringify({
            id: crypto.randomUUID(),
            event: { type: 'join_server', payload: { serverId: serverDoc._id.toString() } }
        }));
        await waitForWsEvent(viewerSocket, 'server_joined');

        viewerSocket.send(JSON.stringify({
            id: crypto.randomUUID(),
            event: { type: 'join_channel', payload: { 
                serverId: serverDoc._id.toString(),
                channelId: channelDoc._id.toString() 
            } }
        }));
        await waitForWsEvent(viewerSocket, 'channel_joined');

        const webhookToken = crypto.randomBytes(64).toString('hex');
        const webhook = await Webhook.create({
            name: 'Test Webhook',
            channelId: channelDoc._id,
            serverId: serverDoc._id,
            token: webhookToken,
            createdBy: owner._id,
        });

        const messageReceivedPromise = waitForWsEvent(viewerSocket, 'message_server');
        const embedsUpdatedPromise = waitForWsEvent(viewerSocket, 'message_server_embeds_updated');

        const webhookRes = await request(app)
            .post(`/api/v1/webhooks/${webhook.token}`)
            .send({
                content: `Here is a link: ${DISCORD_URL}`,
                username: 'Webhook User',
            });

        expect(webhookRes.status).toBe(201);

        const msgEvent = await messageReceivedPromise;
        expect(msgEvent.event.payload.text).toContain(DISCORD_URL);
        expect(msgEvent.event.payload.isWebhook).toBe(true);

        const embedsEvent = await embedsUpdatedPromise;
        expect(embedsEvent.event.payload.messageId).toBe(webhookRes.body.id);
        expect(embedsEvent.event.payload.embeds).toHaveLength(1);
        expect(embedsEvent.event.payload.embeds[0].url).toBe(DISCORD_URL);
        expect(embedsEvent.event.payload.embeds[0].image.url).toContain('74ecdda484e669fa60c5986d2d426d8f.webp');

        viewerSocket.close();
    });

    it('should broadcast to users who have NOT joined the channel but ARE in the server (via permission broadcast)', async () => {
        const owner = await createTestUser({ username: 'owner2', login: 'owner2@test.com' });
        const viewer = await createTestUser({ username: 'viewer2', login: 'viewer2@test.com' });
        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());

        await ServerMember.create({ serverId: serverDoc._id, userId: viewer._id, roles: [] });

        const viewerToken = makeAccessToken(viewer);
        const viewerSocket = await openAuthenticatedSocket(wsUrl, viewerToken);

        viewerSocket.send(JSON.stringify({
            id: crypto.randomUUID(),
            event: { type: 'join_server', payload: { serverId: serverDoc._id.toString() } }
        }));
        await waitForWsEvent(viewerSocket, 'server_joined');

        const webhookToken = crypto.randomBytes(64).toString('hex');
        const webhook = await Webhook.create({
            name: 'Test Webhook 2',
            channelId: channelDoc._id,
            serverId: serverDoc._id,
            token: webhookToken,
            createdBy: owner._id,
        });

        const embedsUpdatedPromise = waitForWsEvent(viewerSocket, 'message_server_embeds_updated');

        await request(app)
            .post(`/api/v1/webhooks/${webhook.token}`)
            .send({
                content: `Update this: ${DISCORD_URL}`,
            });

        const embedsEvent = await embedsUpdatedPromise;
        expect(embedsEvent.event.payload.embeds).toHaveLength(1);

        viewerSocket.close();
    });
});
