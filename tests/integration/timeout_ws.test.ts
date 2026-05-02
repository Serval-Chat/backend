import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RawData } from 'ws';

import { JWT_SECRET } from '../../src/config/env';
import { setup, teardown } from './setup';
import {
    clearDatabase,
    createTestChannel,
    createTestServer,
    createTestUser,
} from './helpers';
import { ServerMember } from '../../src/models/Server';

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

const WS_EVENT_TIMEOUT_MS = 2000;

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
            } catch {
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

import type { Express } from 'express';

describe('Timeout WebSocket Events', () => {
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

    it('should broadcast member_updated when user is timed out via slash command', async () => {
        const owner = await createTestUser({ username: 'owner', login: 'owner@test.com' });
        const target = await createTestUser({ username: 'target', login: 'target@test.com' });
        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());

        await ServerMember.create({ serverId: serverDoc._id, userId: target._id, roles: [] });

        const ownerToken = makeAccessToken(owner);
        const ownerSocket = await openAuthenticatedSocket(wsUrl, ownerToken);

        ownerSocket.send(JSON.stringify({
            id: crypto.randomUUID(),
            event: { type: 'join_server', payload: { serverId: serverDoc._id.toString() } }
        }));
        await waitForWsEvent(ownerSocket, 'server_joined');

        const eventPromise = waitForWsEvent(ownerSocket, 'member_updated');

        const res = await request(app)
            .post('/api/v1/interactions')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                command: 'timeout',
                options: [
                    { name: 'user', value: 'target' },
                    { name: 'duration', value: '10' }
                ],
                serverId: serverDoc._id.toString(),
                channelId: channelDoc._id.toString(),
            });

        expect(res.status).toBe(200);

        const event = await eventPromise;
        expect(event.event.payload.userId).toBe(target._id.toString());
        expect((event.event.payload.member as { communicationDisabledUntil?: string }).communicationDisabledUntil).toBeTruthy();

        ownerSocket.close();
    });

    it('should broadcast member_updated when timeout is removed via slash command', async () => {
        const owner = await createTestUser({ username: 'owner2', login: 'owner2@test.com' });
        const target = await createTestUser({ username: 'target2', login: 'target2@test.com' });
        const serverDoc = await createTestServer(owner._id.toString());
        const channelDoc = await createTestChannel(serverDoc._id.toString());

        const until = new Date(Date.now() + 100000);
        await ServerMember.create({ 
            serverId: serverDoc._id, 
            userId: target._id, 
            roles: [],
            communicationDisabledUntil: until
        });

        const ownerToken = makeAccessToken(owner);
        const ownerSocket = await openAuthenticatedSocket(wsUrl, ownerToken);

        ownerSocket.send(JSON.stringify({
            id: crypto.randomUUID(),
            event: { type: 'join_server', payload: { serverId: serverDoc._id.toString() } }
        }));
        await waitForWsEvent(ownerSocket, 'server_joined');

        const eventPromise = waitForWsEvent(ownerSocket, 'member_updated');

        const res = await request(app)
            .post('/api/v1/interactions')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                command: 'untimeout',
                options: [
                    { name: 'user', value: 'target2' }
                ],
                serverId: serverDoc._id.toString(),
                channelId: channelDoc._id.toString(),
            });

        expect(res.status).toBe(200);

        const event = await eventPromise;
        expect(event.event.payload.userId).toBe(target._id.toString());
        expect((event.event.payload.member as { communicationDisabledUntil?: string }).communicationDisabledUntil).toBeFalsy();

        ownerSocket.close();
    });
});
