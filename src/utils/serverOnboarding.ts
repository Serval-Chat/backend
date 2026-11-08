import type { IServer } from '@/di/interfaces/IServerRepository';
import { isValidSnowflakeId } from '@/utils/snowflake';

export type OnboardingConfig = NonNullable<IServer['onboarding']>;

export function getOnboardingConfig(
    server: Pick<IServer, 'onboarding'>,
): OnboardingConfig {
    const stringArray = (value: unknown): string[] =>
        Array.isArray(value)
            ? value.filter((item): item is string => isValidSnowflakeId(item))
            : [];

    return {
        enabled: server.onboarding?.enabled ?? false,
        guidelines: Array.isArray(server.onboarding?.guidelines)
            ? server.onboarding.guidelines.filter(
                  (item): item is string => typeof item === 'string',
              )
            : [],
        selfAssignableRoleIds: stringArray(
            server.onboarding?.selfAssignableRoleIds,
        ),
        landingChannelId: server.onboarding?.landingChannelId ?? null,
        welcomeChannelIds: stringArray(server.onboarding?.welcomeChannelIds),
    };
}
