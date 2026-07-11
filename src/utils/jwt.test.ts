import { DEFAULT_PERMISSIONS } from '@/permissions/AdminPermissions';
import { hasPermission } from './jwt';

describe('hasPermission', () => {
    it('returns false when the user has no permissions object', () => {
        expect(hasPermission(undefined, 'manageUsers')).toBe(false);
    });

    it('returns false when the specific permission is not granted', () => {
        const user = {
            id: 'u1',
            login: 'u',
            username: 'u',
            tokenVersion: 0,
            permissions: { ...DEFAULT_PERMISSIONS, manageUsers: false },
        };
        expect(hasPermission(user, 'manageUsers')).toBe(false);
    });

    it('returns true when the specific permission is granted', () => {
        const user = {
            id: 'u1',
            login: 'u',
            username: 'u',
            tokenVersion: 0,
            permissions: { ...DEFAULT_PERMISSIONS, manageUsers: true },
        };
        expect(hasPermission(user, 'manageUsers')).toBe(true);
    });

    it('returns true via adminAccess bypass even when the specific permission is false', () => {
        const user = {
            id: 'u1',
            login: 'u',
            username: 'u',
            tokenVersion: 0,
            permissions: {
                ...DEFAULT_PERMISSIONS,
                adminAccess: true,
                manageUsers: false,
            },
        };
        expect(hasPermission(user, 'manageUsers')).toBe(true);
    });
});
