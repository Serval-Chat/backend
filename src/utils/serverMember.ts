import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';

export type PublicServerMember = Omit<
    IServerMember,
    | '_id'
    | 'onboardingRequired'
    | 'rulesAcceptedAt'
    | 'onboardingCompletedAt'
    | 'hiddenChannelIds'
    | 'hiddenCategoryIds'
> & { _id: string };

export function mapPublicServerMember(
    member: IServerMember,
): PublicServerMember {
    return {
        _id: member.snowflakeId,
        snowflakeId: member.snowflakeId,
        serverId: member.serverId,
        userId: member.userId,
        roles: member.roles,
        joinedAt: member.joinedAt,
        communicationDisabledUntil: member.communicationDisabledUntil,
    };
}
