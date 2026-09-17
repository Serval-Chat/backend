import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken, createTestServer } from './helpers';
import { ServerMember } from '../../src/models/Server';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Server member responses expose id (snowflakeId), not raw _id', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;
    let serverId: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        owner = await createTestUser({
            login: `member-id-owner-${Date.now()}@example.com`,
        });
        ownerToken = await generateAuthToken(owner);

        const server = await createTestServer(owner.snowflakeId);
        serverId = server.snowflakeId;
    });

    afterAll(async () => {
        await teardown();
    });

    it('GET /members returns each member with id === their snowflakeId, and no raw _id', async () => {
        const ownerMembership = await ServerMember.findOne({
            serverId,
            userId: owner.snowflakeId,
        });

        const res = await request(app)
            .get(`/api/v1/servers/${serverId}/members`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ownerEntry = res.body.find(
            (m: { userId: string }) => m.userId === owner.snowflakeId,
        );
        expect(ownerEntry).toBeDefined();
        expect(ownerEntry.id).toBe(ownerMembership?.snowflakeId);
        expect(ownerEntry._id).toBeUndefined();
        expect(ownerEntry.user.id).toBe(owner.snowflakeId);
        expect(ownerEntry.user._id).toBeUndefined();
    });

    it('GET /members/:userId returns id === the member snowflakeId, and no raw _id', async () => {
        const ownerMembership = await ServerMember.findOne({
            serverId,
            userId: owner.snowflakeId,
        });

        const res = await request(app)
            .get(`/api/v1/servers/${serverId}/members/${owner.snowflakeId}`)
            .set('Authorization', `Bearer ${ownerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(ownerMembership?.snowflakeId);
        expect(res.body._id).toBeUndefined();
    });

    it('PATCH self-roles returns the updated member with id === their snowflakeId', async () => {
        const ownerMembership = await ServerMember.findOne({
            serverId,
            userId: owner.snowflakeId,
        });

        const res = await request(app)
            .patch(`/api/v1/servers/${serverId}/self-roles`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ roleIds: [] });

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(ownerMembership?.snowflakeId);
        expect(res.body._id).toBeUndefined();
    });
});
