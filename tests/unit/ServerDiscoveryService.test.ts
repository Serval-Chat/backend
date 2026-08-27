import { Types } from 'mongoose';
import {
    buildDiscoveryTagFilters,
    getDiscoveryEligibility,
    normalizeDiscoveryTags,
} from '../../src/services/ServerDiscoveryService';
import type { IVanityLink } from '../../src/di/interfaces/IVanityLinkRepository';
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

const makeVanityLink = (overrides: Partial<IVanityLink> = {}): IVanityLink =>
    ({
        _id: new Types.ObjectId(),
        snowflakeId: '1234567890123456789',
        serverId: new Types.ObjectId().toString(),
        code: 'vanity',
        createdByUserId: new Types.ObjectId().toString(),
        createdAt: new Date(),
        ...overrides,
    }) as IVanityLink;

describe('ServerDiscoveryService eligibility helpers', () => {
    it('accepts verified opted-in servers with a vanity link', () => {
        const status = getDiscoveryEligibility(makeServer(), makeVanityLink());

        expect(status.eligible).toBe(true);
        expect(status.blockers).toEqual([]);
        expect(status.hasValidVanityInvite).toBe(true);
        expect(status.vanityInviteCode).toBe('vanity');
    });

    it('rejects servers with no vanity link', () => {
        const status = getDiscoveryEligibility(makeServer(), null);

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain('Server needs a vanity link.');
        expect(status.hasValidVanityInvite).toBe(false);
        expect(status.vanityInviteCode).toBeUndefined();
    });

    it('rejects unverified servers', () => {
        const status = getDiscoveryEligibility(
            makeServer({ verified: false }),
            makeVanityLink(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain('Server must be verified.');
    });

    it('rejects servers that have not opted in', () => {
        const status = getDiscoveryEligibility(
            makeServer({ discoveryEnabled: false }),
            makeVanityLink(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain(
            'Server must opt in to discovery.',
        );
    });

    it('rejects servers without a description or tags', () => {
        const missingDescription = getDiscoveryEligibility(
            makeServer({ description: '' }),
            makeVanityLink(),
        );
        const missingTags = getDiscoveryEligibility(
            makeServer({ tags: [] }),
            makeVanityLink(),
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
            makeVanityLink(),
        );

        expect(status.eligible).toBe(false);
        expect(status.blockers).toContain(
            'Deleted servers cannot appear in discovery.',
        );
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
