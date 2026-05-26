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
    return {
        _id: member._id,
        serverId: member.serverId,
        userId: member.userId,
        roles: member.roles,
        joinedAt: member.joinedAt,
        communicationDisabledUntil: member.communicationDisabledUntil,
    };
}
