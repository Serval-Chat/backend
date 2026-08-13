import { DEFAULT_PERMISSIONS } from '@/permissions/AdminPermissions';
import type { AdminPermissions } from '@/permissions/AdminPermissions';
import {
    grantsBeyond,
    heldPermissions,
    isSuperAdmin,
    outranks,
} from '../adminHierarchy';

const perms = (...keys: string[]): AdminPermissions => {
    const result = { ...DEFAULT_PERMISSIONS };
    for (const key of keys) result[key] = true;
    return result;
};

const NOBODY = perms();
const BAN_ONLY = perms('banUsers');
const MANAGE_ONLY = perms('manageUsers');
const MODERATOR = perms('banUsers', 'warnUsers', 'viewUsers');
const SUPER = perms('adminAccess');

describe('grantsBeyond', () => {
    it('closes the escalation the audit described', () => {
        const escalation = perms(
            'manageUsers',
            'manageServer',
            'manageBots',
            'manageInvites',
            'manageBadges',
            'viewUsers',
            'viewBans',
            'warnUsers',
            'viewLogs',
        );

        expect(grantsBeyond(BAN_ONLY, escalation)).toEqual(
            expect.arrayContaining(['manageUsers', 'manageServer']),
        );
        expect(grantsBeyond(BAN_ONLY, escalation)).toHaveLength(9);
    });

    it('allows granting exactly what the caller holds', () => {
        expect(grantsBeyond(MODERATOR, MODERATOR)).toEqual([]);
        expect(grantsBeyond(MODERATOR, perms('warnUsers'))).toEqual([]);
    });

    it('names every permission the caller lacks', () => {
        expect(
            grantsBeyond(perms('viewUsers'), perms('viewUsers', 'banUsers')),
        ).toEqual(['banUsers']);
    });

    it('lets a super admin grant anything', () => {
        expect(grantsBeyond(SUPER, perms('manageBots', 'adminAccess'))).toEqual(
            [],
        );
    });

    it('stops a non-admin granting anything at all', () => {
        expect(grantsBeyond(NOBODY, perms('viewUsers'))).toEqual(['viewUsers']);
        expect(grantsBeyond(undefined, perms('viewUsers'))).toEqual([
            'viewUsers',
        ]);
    });

    it('permits revoking down to nothing', () => {
        expect(grantsBeyond(BAN_ONLY, NOBODY)).toEqual([]);
    });
});

describe('outranks', () => {
    it('inverts the old ladder: banUsers no longer outranks manageUsers', () => {
        expect(outranks(BAN_ONLY, MANAGE_ONLY)).toBe(false);
        expect(outranks(MANAGE_ONLY, BAN_ONLY)).toBe(false);
    });

    it('holds over a strict subset', () => {
        expect(outranks(MODERATOR, perms('warnUsers'))).toBe(true);
        expect(outranks(MODERATOR, NOBODY)).toBe(true);
    });

    it('refuses an equal set, so peers cannot act on each other', () => {
        expect(outranks(MODERATOR, MODERATOR)).toBe(false);
        expect(outranks(SUPER, SUPER)).toBe(false);
    });

    it('refuses a target holding anything the caller does not', () => {
        expect(outranks(MODERATOR, perms('warnUsers', 'manageBots'))).toBe(
            false,
        );
    });

    it('gives a super admin authority over everyone but another super admin', () => {
        expect(outranks(SUPER, MODERATOR)).toBe(true);
        expect(outranks(SUPER, perms('manageBots'))).toBe(true);
        expect(outranks(SUPER, SUPER)).toBe(false);
    });

    it('gives a permissionless caller authority over nobody', () => {
        expect(outranks(NOBODY, NOBODY)).toBe(false);
        expect(outranks(undefined, NOBODY)).toBe(false);
    });
});

describe('helpers', () => {
    it('counts only permissions that are true', () => {
        expect([...heldPermissions(MODERATOR)].sort()).toEqual([
            'banUsers',
            'viewUsers',
            'warnUsers',
        ]);
        expect(heldPermissions(undefined).size).toBe(0);
    });

    it('recognises the superuser flag', () => {
        expect(isSuperAdmin(SUPER)).toBe(true);
        expect(isSuperAdmin(MODERATOR)).toBe(false);
        expect(isSuperAdmin(undefined)).toBe(false);
    });

    it('ignores keys outside the declared permission set', () => {
        const rogue = { ...DEFAULT_PERMISSIONS, notAPermission: true };
        expect(heldPermissions(rogue).size).toBe(0);
        expect(grantsBeyond(NOBODY, rogue)).toEqual([]);
    });
});
