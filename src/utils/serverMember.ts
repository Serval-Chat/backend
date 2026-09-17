import type { IServerMember } from '@/di/interfaces/IServerMemberRepository';
import type { MappedUser } from '@/utils/user';

export interface ServerMemberDTOShape {
    id: string;
    serverId: string;
    userId: string;
    roles: string[];
    communicationDisabledUntil?: string | null;
    joinedAt?: string;
}

export interface ServerMemberWithUserDTOShape extends ServerMemberDTOShape {
    user: MappedUser | null;
}

const toIsoOrNullish = (
    value: Date | null | undefined,
): string | null | undefined =>
    value === null || value === undefined ? value : value.toISOString();

export function mapServerMemberToDTO(
    member: IServerMember,
): ServerMemberDTOShape {
    return {
        id: member.snowflakeId,
        serverId: member.serverId,
        userId: member.userId,
        roles: member.roles,
        communicationDisabledUntil: toIsoOrNullish(
            member.communicationDisabledUntil,
        ),
        joinedAt: toIsoOrNullish(member.joinedAt) ?? undefined,
    };
}

export function mapServerMemberWithUserToDTO(
    member: IServerMember,
    user: MappedUser | null,
): ServerMemberWithUserDTOShape {
    return { ...mapServerMemberToDTO(member), user };
}

export type PublicServerMember = Pick<
    IServerMember,
    | 'snowflakeId'
    | 'serverId'
    | 'userId'
    | 'roles'
    | 'joinedAt'
    | 'communicationDisabledUntil'
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
