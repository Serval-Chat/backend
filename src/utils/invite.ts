import type { IInvite } from '@/di/interfaces/IInviteRepository';

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
