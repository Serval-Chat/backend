import type {
    IInviteRepository,
    IInvite,
} from '@/di/interfaces/IInviteRepository';
import type {
    IVanityLinkRepository,
    IVanityLink,
} from '@/di/interfaces/IVanityLinkRepository';

type InviteUsageFields = Pick<IInvite, 'expiresAt' | 'maxUses' | 'uses'>;

export function isInviteExpired(invite: InviteUsageFields): boolean {
    return (
        invite.expiresAt !== undefined &&
        new Date(invite.expiresAt) < new Date()
    );
}

export function isInviteMaxedOut(invite: InviteUsageFields): boolean {
    return (
        invite.maxUses !== undefined &&
        invite.maxUses > 0 &&
        invite.uses >= invite.maxUses
    );
}

export function isInviteUsable(invite: InviteUsageFields): boolean {
    return !isInviteExpired(invite) && !isInviteMaxedOut(invite);
}

export type JoinTarget =
    | { source: 'invite'; invite: IInvite }
    | { source: 'vanity'; vanityLink: IVanityLink };

export async function resolveJoinTarget(
    inviteRepo: Pick<IInviteRepository, 'findByCode'>,
    vanityLinkRepo: Pick<IVanityLinkRepository, 'findByCode'>,
    code: string,
): Promise<JoinTarget | null> {
    const invite = await inviteRepo.findByCode(code);
    if (invite !== null) return { source: 'invite', invite };

    const vanityLink = await vanityLinkRepo.findByCode(code);
    if (vanityLink !== null) return { source: 'vanity', vanityLink };

    return null;
}

export function getJoinTargetServerId(target: JoinTarget): string {
    return target.source === 'invite'
        ? target.invite.serverId
        : target.vanityLink.serverId;
}

export function getJoinTargetCode(target: JoinTarget): string {
    return target.source === 'invite'
        ? target.invite.code
        : target.vanityLink.code;
}

export function isJoinTargetUsable(target: JoinTarget): boolean {
    return target.source === 'invite' ? isInviteUsable(target.invite) : true;
}
