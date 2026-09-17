import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';
import type { MappedUser } from '@/utils/user';

import {
    mapServerMemberToDTO,
    mapServerMemberWithUserToDTO,
} from './serverMember';

const baseMember: IServerMember = {
    _id: {} as IServerMember['_id'],
    snowflakeId: '0123456789012345678',
    serverId: 'server-1',
    userId: 'user-1',
    roles: ['role-1'],
};

describe('mapServerMemberToDTO', () => {
    it('aliases snowflakeId to id, never the Mongo _id', () => {
        const dto = mapServerMemberToDTO(baseMember);
        expect(dto.id).toBe('0123456789012345678');
        expect(dto).not.toHaveProperty('_id');
        expect(dto).not.toHaveProperty('snowflakeId');
    });

    it('serializes joinedAt to an ISO string when present', () => {
        const joinedAt = new Date('2024-01-01T00:00:00.000Z');
        const dto = mapServerMemberToDTO({ ...baseMember, joinedAt });
        expect(dto.joinedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('omits joinedAt when absent, rather than emitting null', () => {
        const dto = mapServerMemberToDTO(baseMember);
        expect(dto.joinedAt).toBeUndefined();
    });

    it('serializes communicationDisabledUntil to an ISO string when present', () => {
        const until = new Date('2024-06-01T12:00:00.000Z');
        const dto = mapServerMemberToDTO({
            ...baseMember,
            communicationDisabledUntil: until,
        });
        expect(dto.communicationDisabledUntil).toBe('2024-06-01T12:00:00.000Z');
    });

    it('preserves an explicit null communicationDisabledUntil as null, not omitted', () => {
        // The Mongoose schema default is null, even though IServerMember's
        // type only declares `Date | undefined` for this field.
        const dto = mapServerMemberToDTO({
            ...baseMember,
            communicationDisabledUntil: null,
        } as unknown as IServerMember);
        expect(dto.communicationDisabledUntil).toBeNull();
    });

    it('carries roles/serverId/userId through unchanged', () => {
        const dto = mapServerMemberToDTO(baseMember);
        expect(dto.serverId).toBe('server-1');
        expect(dto.userId).toBe('user-1');
        expect(dto.roles).toEqual(['role-1']);
    });
});

describe('mapServerMemberWithUserToDTO', () => {
    it('embeds the mapped user alongside the member fields', () => {
        const user: MappedUser = {
            id: 'user-1',
            username: 'alice',
        } as MappedUser;

        const dto = mapServerMemberWithUserToDTO(baseMember, user);
        expect(dto.id).toBe('0123456789012345678');
        expect(dto.user).toBe(user);
    });

    it('allows a null user (e.g. the underlying account was deleted)', () => {
        const dto = mapServerMemberWithUserToDTO(baseMember, null);
        expect(dto.user).toBeNull();
    });
});
