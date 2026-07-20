import request from 'supertest';
import { setup, teardown } from './setup';
import { createTestUser, generateAuthToken } from './helpers';
import { Role, ServerMember } from '../../src/models/Server';
import type { IUser } from '../../src/models/User';
import type { Express } from 'express';

describe('Server creation grants the @everyone role', () => {
    let app: Express;
    let owner: IUser;
    let ownerToken: string;

    beforeAll(async () => {
        const result = await setup();
        app = result.app;

        owner = await createTestUser({
            login: `server-owner-${Date.now()}@example.com`,
        });
        ownerToken = generateAuthToken(owner);
    });

    afterAll(async () => {
        await teardown();
    });

    it('creates an @everyone role for a newly created server and gives the creator access to it', async () => {
        const createRes = await request(app)
            .post('/api/v1/servers')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({ name: 'My New Server' });

        expect(createRes.status).toBe(201);
        const serverId = createRes.body.server.id as string;
        expect(serverId).toBeTruthy();

        // The @everyone role must exist for the new server.
        const everyoneRole = await Role.findOne({
            serverId,
            name: '@everyone',
        });
        expect(everyoneRole).not.toBeNull();
        expect(everyoneRole?.position).toBe(0);
        expect(everyoneRole?.permissions?.sendMessages).toBe(true);

        // The creator must be a member of the new server (and, having no
        // explicit roles, gets the @everyone role's permissions by default).
        const ownerMembership = await ServerMember.findOne({
            serverId,
            userId: owner.snowflakeId,
        });
        expect(ownerMembership).not.toBeNull();

        // The API-reported member list should show exactly one role-bearing
        // relationship to the server: @everyone, reflected via the server's
        // role list rather than the member's explicit roles array.
        const rolesRes = await request(app)
            .get(`/api/v1/servers/${serverId}/roles`)
            .set('Authorization', `Bearer ${ownerToken}`);
        expect(rolesRes.status).toBe(200);
        expect(
            rolesRes.body.some(
                (role: { name: string }) => role.name === '@everyone',
            ),
        ).toBe(true);
    });
});
