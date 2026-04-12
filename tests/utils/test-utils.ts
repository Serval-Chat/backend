import { Types } from 'mongoose';

import type { Request } from 'express';

export function createTestUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        username: 'testuser',
        login: 'testuser',
        password: '$2b$10$hashedpassword',
        email: 'test@example.com',
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}

export function createTestBan(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        reason: 'Test ban reason',
        active: true,
        createdAt: new Date(),
        ...overrides
    };
}

export function createTestMessage(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        senderId: new Types.ObjectId(),
        receiverId: new Types.ObjectId(),
        text: 'Test message',
        createdAt: new Date(),
        isEdited: false,
        ...overrides
    };
}

export function createTestServer(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        name: 'Test Server',
        ownerId: new Types.ObjectId(),
        createdAt: new Date(),
        ...overrides
    };
}

export function createMockRequest(overrides: Record<string, unknown> = {}): Request {
    return {
        headers: {},
        body: {},
        query: {},
        params: {},
        path: '/api/v1/test',
        ip: '127.0.0.1',
        ...overrides
    } as unknown as Request;
}
