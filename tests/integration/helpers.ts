import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { io as Client } from 'socket.io-client';
import { User } from '../../src/models/User';
import type { IUser } from '../../src/models/User';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export async function createTestUser(overrides: Record<string, unknown> = {}) {
    const email = (overrides.login !== undefined && overrides.login !== null && overrides.login !== '') ? String(overrides.login) : `test_${Date.now()}@example.com`;

    const user = await User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        login: email,
        password: 'password123',
        tokenVersion: 0,
        ...overrides
    });
    return user;
}

export function generateAuthToken(user: IUser) {
    return jwt.sign(
        {
            id: user._id,
            username: user.username,
            tokenVersion: user.tokenVersion,
            isBot: user.isBot
        },
        (process.env.JWT_SECRET !== undefined && process.env.JWT_SECRET !== '') ? process.env.JWT_SECRET : 'test-jwt-secret',
        { expiresIn: '1h' }
    );
}

export function createSocketClient(server: Server, token: string) {
    const address = server.address() as AddressInfo;
    const url = `http://localhost:${address.port}`;

    return Client(url, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true
    });
}

export async function clearDatabase() {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        if (collection) {
            await collection.deleteMany({});
        }
    }
}

export { User };

export async function createTestServer(ownerId: string, overrides: Record<string, unknown> = {}) {
    const { Server, Role, ServerMember } = await import('../../src/models/Server');
    const server = await Server.create({
        name: `Test Server ${Date.now()}`,
        ownerId,
        ...overrides
    });

    await Role.create({
        serverId: server._id,
        name: '@everyone',
        position: 0,
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
            addReactions: true,
            manageReactions: false
        }
    });

    await ServerMember.create({
        serverId: server._id,
        userId: ownerId,
        roles: []
    });

    return server;
}

export async function createTestChannel(serverId: string, overrides: Record<string, unknown> = {}) {
    const { Channel } = await import('../../src/models/Server');
    const channel = await Channel.create({
        serverId,
        name: 'general',
        type: 'text',
        ...overrides
    });
    return channel;
}

export async function createTestMessage(serverId: string, channelId: string, senderId: string, overrides: Record<string, unknown> = {}) {
    const { ServerMessage } = await import('../../src/models/Server');
    const message = await ServerMessage.create({
        serverId,
        channelId,
        senderId,
        text: 'Test message',
        ...overrides
    });
    return message;
}
