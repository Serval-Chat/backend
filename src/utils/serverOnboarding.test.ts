import type { IServer } from '@/di/interfaces/IServerRepository';
import { getOnboardingConfig } from '@/utils/serverOnboarding';

const stored = (onboarding: object) =>
    ({ onboarding }) as Pick<IServer, 'onboarding'>;

describe('getOnboardingConfig', () => {
    it('returns disabled defaults when the server has no onboarding', () => {
        expect(getOnboardingConfig({})).toEqual({
            enabled: false,
            guidelines: [],
            selfAssignableRoleIds: [],
            landingChannelId: null,
            welcomeChannelIds: [],
        });
    });

    it('keeps only snowflake IDs and string guidelines', () => {
        const config = getOnboardingConfig(
            stored({
                enabled: true,
                guidelines: ['Rule 1', null, 'Rule 2'],
                selfAssignableRoleIds: ['1000000000000000001', 'abc', ''],
                landingChannelId: '1000000000000000002',
                welcomeChannelIds: [
                    '507f1f77bcf86cd799439011',
                    '1000000000000000003',
                ],
            }),
        );

        expect(config).toEqual({
            enabled: true,
            guidelines: ['Rule 1', 'Rule 2'],
            selfAssignableRoleIds: ['1000000000000000001'],
            landingChannelId: '1000000000000000002',
            welcomeChannelIds: ['1000000000000000003'],
        });
    });

    it('treats non-array ID fields as empty', () => {
        const config = getOnboardingConfig(
            stored({
                enabled: true,
                guidelines: 'nope',
                selfAssignableRoleIds: 'nope',
                welcomeChannelIds: undefined,
            }),
        );

        expect(config.guidelines).toEqual([]);
        expect(config.selfAssignableRoleIds).toEqual([]);
        expect(config.welcomeChannelIds).toEqual([]);
        expect(config.landingChannelId).toBeNull();
    });
});
