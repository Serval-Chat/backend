import { Types } from 'mongoose';
import { generateSnowflakeId } from '../../src/utils/snowflake';

import type { Request } from 'express';

export function createTestUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        snowflakeId: generateSnowflakeId(),
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
        userId: generateSnowflakeId(),
        reason: 'Test ban reason',
        active: true,
        createdAt: new Date(),
        ...overrides
    };
}

export function createTestMessage(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId(),
        senderId: generateSnowflakeId(),
        receiverId: generateSnowflakeId(),
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
        ownerId: generateSnowflakeId(),
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
    } as Request;
}
