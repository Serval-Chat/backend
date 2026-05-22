import { Types } from 'mongoose';
import {
    buildDiscoveryTagFilters,
    getDiscoveryEligibility,
    getDiscoveryInvitePath,
    isValidDiscoveryInvite,
    normalizeDiscoveryTags,
} from '../../src/services/ServerDiscoveryService';
import type { IInvite } from '../../src/di/interfaces/IInviteRepository';
import type { IServer } from '../../src/di/interfaces/IServerRepository';

const makeServer = (overrides: Partial<IServer> = {}): IServer =>
    ({
        _id: new Types.ObjectId(),
        name: 'Discovery Test',
        ownerId: new Types.ObjectId(),
        verified: true,
        discoveryEnabled: true,
        description: 'A place for discovery tests.',
        tags: ['Testing'],
        ...overrides,
    }) as IServer;

const makeInvite = (overrides: Partial<IInvite> = {}): IInvite =>
    ({
        _id: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        code: 'vanity',
        createdByUserId: new Types.ObjectId(),
        uses: 0,
        createdAt: new Date(),
        ...overrides,
    }) as IInvite;

describe('ServerDiscoveryService eligibility helpers', () => {
    it('accepts verified opted-in servers with unlimited non-expiring vanity invites', () => {
        const status = getDiscoveryEligibility(makeServer(), makeInvite());

        expect(status.eligible).toBe(true);
        expect(status.blockers).toEqual([]);
        expect(status.hasValidVanityInvite).toBe(true);
        expect(status.vanityInviteCode).toBe('vanity');
    });

    it('rejects unverified servers', () => {
        const status = getDiscoveryEligibility(
            makeServer({ verified: false }),
            makeInvite(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain('Server must be verified.');
    });

    it('rejects servers that have not opted in', () => {
        const status = getDiscoveryEligibility(
            makeServer({ discoveryEnabled: false }),
            makeInvite(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain(
            'Server must opt in to discovery.',
        );
    });

    it('rejects servers without a description or tags', () => {
        const missingDescription = getDiscoveryEligibility(
            makeServer({ description: '' }),
            makeInvite(),
        );
        const missingTags = getDiscoveryEligibility(
            makeServer({ tags: [] }),
            makeInvite(),
        );

        expect(missingDescription.eligible).toBe(false);
        expect(missingDescription.blockers).toContain(
            'Server must have a description.',
        );
        expect(missingTags.eligible).toBe(false);
        expect(missingTags.blockers).toContain(
            'Server must have at least one tag.',
        );
    });

    it('rejects deleted servers', () => {
        const status = getDiscoveryEligibility(
            makeServer({ deletedAt: new Date() }),
            makeInvite(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain(
            'Deleted servers cannot appear in discovery.',
        );
    });

    it('rejects limited and expiring invites', () => {
        expect(isValidDiscoveryInvite(makeInvite({ maxUses: 1 }))).toBe(false);
        expect(isValidDiscoveryInvite(makeInvite({ expiresAt: new Date() })))
            .toBe(false);
    });

    it('treats legacy non-random invite codes as vanity links', () => {
        expect(getDiscoveryInvitePath(makeInvite({ code: 'legacy-code' })))
            .toBe('legacy-code');
        expect(getDiscoveryInvitePath(makeInvite({ code: 'deadbeef' }))).toBe(
            null,
        );
        expect(
            getDiscoveryInvitePath(
                makeInvite({ code: 'deadbeef', customPath: 'chosen-path' }),
            ),
        ).toBe('chosen-path');
    });

    it('normalizes discovery tags for storage and queries', () => {
        expect(
            normalizeDiscoveryTags([
                ' Gaming ',
                'gaming',
                '',
                'VeryLongTagNameThatWillBeTrimmed',
                'Art',
            ]),
        ).toEqual(['Gaming', 'VeryLongTagNameThatWillBe', 'Art']);
    });

    it('builds one Elasticsearch filter per selected tag', () => {
        expect(buildDiscoveryTagFilters([' Gaming ', 'Art'])).toEqual([
            { term: { tags: 'Gaming' } },
            { term: { tags: 'Art' } },
        ]);
    });
});
