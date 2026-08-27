import {
    getJoinTargetCode,
    getJoinTargetServerId,
    isInviteExpired,
    isInviteMaxedOut,
    isInviteUsable,
    isJoinTargetUsable,
    resolveJoinTarget,
} from './invite';
import type { IInvite } from '@/di/interfaces/IInviteRepository';
import type { IVanityLink } from '@/di/interfaces/IVanityLinkRepository';

const makeInvite = (overrides: Partial<IInvite> = {}): IInvite =>
    ({
        serverId: 'server1',
        code: 'inv123',
        uses: 0,
        createdByUserId: 'user1',
        ...overrides,
    }) as IInvite;

const makeVanityLink = (overrides: Partial<IVanityLink> = {}): IVanityLink =>
    ({
        serverId: 'server1',
        code: 'myserver',
        createdByUserId: 'user1',
        createdAt: new Date(),
        ...overrides,
    }) as IVanityLink;

describe('isInviteExpired / isInviteMaxedOut / isInviteUsable', () => {
    it('treats an invite with no expiresAt as never expired', () => {
        expect(isInviteExpired(makeInvite())).toBe(false);
    });

    it('treats a past expiresAt as expired', () => {
        expect(
            isInviteExpired(
                makeInvite({ expiresAt: new Date(Date.now() - 1000) }),
            ),
        ).toBe(true);
    });

    it('treats maxUses of 0 as unlimited', () => {
        expect(isInviteMaxedOut(makeInvite({ maxUses: 0, uses: 999 }))).toBe(
            false,
        );
    });

    it('treats uses >= maxUses as maxed out', () => {
        expect(isInviteMaxedOut(makeInvite({ maxUses: 5, uses: 5 }))).toBe(
            true,
        );
        expect(isInviteMaxedOut(makeInvite({ maxUses: 5, uses: 4 }))).toBe(
            false,
        );
    });

    it('is usable only when neither expired nor maxed out', () => {
        expect(isInviteUsable(makeInvite())).toBe(true);
        expect(
            isInviteUsable(makeInvite({ expiresAt: new Date(Date.now() - 1) })),
        ).toBe(false);
        expect(isInviteUsable(makeInvite({ maxUses: 1, uses: 1 }))).toBe(false);
    });
});

describe('resolveJoinTarget', () => {
    it('prefers a matching invite over a vanity link with the same code', async () => {
        const invite = makeInvite({ code: 'shared' });
        const inviteRepo = { findByCode: jest.fn().mockResolvedValue(invite) };
        const vanityLinkRepo = {
            findByCode: jest.fn().mockResolvedValue(makeVanityLink()),
        };

        const target = await resolveJoinTarget(
            inviteRepo,
            vanityLinkRepo,
            'shared',
        );

        expect(target).toEqual({ source: 'invite', invite });
        expect(vanityLinkRepo.findByCode).not.toHaveBeenCalled();
    });

    it('falls back to a vanity link when no invite matches', async () => {
        const vanityLink = makeVanityLink({ code: 'myserver' });
        const inviteRepo = { findByCode: jest.fn().mockResolvedValue(null) };
        const vanityLinkRepo = {
            findByCode: jest.fn().mockResolvedValue(vanityLink),
        };

        const target = await resolveJoinTarget(
            inviteRepo,
            vanityLinkRepo,
            'myserver',
        );

        expect(target).toEqual({ source: 'vanity', vanityLink });
    });

    it('returns null when neither an invite nor a vanity link matches', async () => {
        const inviteRepo = { findByCode: jest.fn().mockResolvedValue(null) };
        const vanityLinkRepo = {
            findByCode: jest.fn().mockResolvedValue(null),
        };

        const target = await resolveJoinTarget(
            inviteRepo,
            vanityLinkRepo,
            'nonexistent',
        );

        expect(target).toBeNull();
    });
});

describe('getJoinTargetServerId / getJoinTargetCode / isJoinTargetUsable', () => {
    it('reads through to the invite fields for an invite target', () => {
        const invite = makeInvite({
            serverId: 'inviteServer',
            code: 'inviteCode',
        });
        const target = { source: 'invite' as const, invite };

        expect(getJoinTargetServerId(target)).toBe('inviteServer');
        expect(getJoinTargetCode(target)).toBe('inviteCode');
    });

    it('reads through to the vanity link fields for a vanity target', () => {
        const vanityLink = makeVanityLink({
            serverId: 'vanityServer',
            code: 'vanityCode',
        });
        const target = { source: 'vanity' as const, vanityLink };

        expect(getJoinTargetServerId(target)).toBe('vanityServer');
        expect(getJoinTargetCode(target)).toBe('vanityCode');
    });

    it('a vanity target is always usable, regardless of invite-style limits', () => {
        const target = {
            source: 'vanity' as const,
            vanityLink: makeVanityLink(),
        };

        expect(isJoinTargetUsable(target)).toBe(true);
    });

    it('an invite target defers to isInviteUsable', () => {
        const usable = {
            source: 'invite' as const,
            invite: makeInvite(),
        };
        const expired = {
            source: 'invite' as const,
            invite: makeInvite({ expiresAt: new Date(Date.now() - 1) }),
        };

        expect(isJoinTargetUsable(usable)).toBe(true);
        expect(isJoinTargetUsable(expired)).toBe(false);
    });
});
