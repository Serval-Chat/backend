import { PERMISSION_KEYS } from '@/permissions/AdminPermissions';
import type { AdminPermissions } from '@/permissions/AdminPermissions';

export function heldPermissions(
    permissions: AdminPermissions | undefined,
): Set<string> {
    if (permissions === undefined) return new Set();
    return new Set(PERMISSION_KEYS.filter((key) => permissions[key] === true));
}

export function isSuperAdmin(
    permissions: AdminPermissions | undefined,
): boolean {
    return permissions?.adminAccess === true;
}

export function grantsBeyond(
    caller: AdminPermissions | undefined,
    requested: AdminPermissions | undefined,
): string[] {
    if (isSuperAdmin(caller)) return [];
    const held = heldPermissions(caller);
    return [...heldPermissions(requested)].filter((key) => !held.has(key));
}

export function outranks(
    caller: AdminPermissions | undefined,
    target: AdminPermissions | undefined,
): boolean {
    if (isSuperAdmin(caller)) return !isSuperAdmin(target);

    const callerHeld = heldPermissions(caller);
    const targetHeld = heldPermissions(target);

    if (callerHeld.size === 0) return false;
    if (targetHeld.size >= callerHeld.size) return false;
    return [...targetHeld].every((key) => callerHeld.has(key));
}
