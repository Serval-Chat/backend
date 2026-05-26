import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';

export type PublicServerMember = Omit<
    IServerMember,
    | 'onboardingRequired'
    | 'rulesAcceptedAt'
    | 'onboardingCompletedAt'
    | 'hiddenChannelIds'
    | 'hiddenCategoryIds'
>;

export function mapPublicServerMember(
    member: IServerMember,
): PublicServerMember {
    const {
        onboardingRequired: _onboardingRequired,
        rulesAcceptedAt: _rulesAcceptedAt,
        onboardingCompletedAt: _onboardingCompletedAt,
        hiddenChannelIds: _hiddenChannelIds,
        hiddenCategoryIds: _hiddenCategoryIds,
        ...publicMember
    } = member;

    return publicMember;
}
