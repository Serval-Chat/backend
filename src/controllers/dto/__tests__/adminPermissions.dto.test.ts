import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PERMISSION_KEYS } from '@/permissions/AdminPermissions';
import { AdminUpdateUserPermissionsRequestDTO } from '../admin-user-actions.request.dto';

const complete = () =>
    Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])) as Record<
        string,
        unknown
    >;

async function check(permissions: unknown) {
    const dto = plainToInstance(AdminUpdateUserPermissionsRequestDTO, {
        permissions,
    });
    return validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
}

describe('AdminUpdateUserPermissionsRequestDTO', () => {
    it('accepts the complete set the admin UI sends', async () => {
        expect(await check(complete())).toHaveLength(0);
    });

    it('declares every permission key, so none can drift out of the DTO', async () => {
        const dto = plainToInstance(AdminUpdateUserPermissionsRequestDTO, {
            permissions: complete(),
        });
        expect(Object.keys(dto.permissions).sort()).toEqual(
            [...PERMISSION_KEYS].sort(),
        );
    });

    it.each(PERMISSION_KEYS)('rejects a body missing %s', async (key) => {
        const partial = complete();
        delete partial[key];

        expect(await check(partial)).not.toHaveLength(0);
    });

    it('rejects an unknown key instead of persisting it', async () => {
        expect(
            await check({ ...complete(), notAPermission: true }),
        ).not.toHaveLength(0);
    });

    it.each([['yes'], [1], [null], [{}]])(
        'rejects %p as a permission value',
        async (value) => {
            expect(
                await check({ ...complete(), banUsers: value }),
            ).not.toHaveLength(0);
        },
    );

    it('rejects a permissions field that is not an object', async () => {
        expect(await check('adminAccess')).not.toHaveLength(0);
        expect(await check(undefined)).not.toHaveLength(0);
    });
});
