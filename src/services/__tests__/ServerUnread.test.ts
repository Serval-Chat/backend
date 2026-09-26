/* eslint-disable @typescript-eslint/no-explicit-any */
import { isChannelUnread, resolveChannelVisibility } from '../ServerUnread';
import type { PermissionService } from '@/permissions/PermissionService';
import type { IChannel } from '@/di/interfaces/IChannelRepository';

const SERVER = '0314440862954160128';
const USER = '0244871598790672384';
const CATEGORY = '0336245712461234176';

type FixtureChannel = Pick<
    IChannel,
    'snowflakeId' | 'type' | 'lastMessageAt' | 'categoryId'
>;

const channel = (overrides: Partial<FixtureChannel> = {}): FixtureChannel => ({
    snowflakeId: '0336236036789108736',
    type: 'text',
    lastMessageAt: new Date('2026-08-01T18:15:36.248Z'),
    categoryId: null,
    ...overrides,
});

const makePermissionService = (
    channelPerms: Map<string, boolean>,
    categoryPerms: Map<string, boolean>,
): PermissionService =>
    ({
        hasChannelPermissions: jest
            .fn()
            .mockImplementation(
                async (
                    _serverId: string,
                    _userId: string,
                    ids: string[],
                ): Promise<Map<string, boolean>> =>
                    new Map(
                        ids.map((id) => [id, channelPerms.get(id) ?? false]),
                    ),
            ),
        hasCategoryPermissions: jest
            .fn()
            .mockImplementation(
                async (
                    _serverId: string,
                    _userId: string,
                    ids: string[],
                ): Promise<Map<string, boolean>> =>
                    new Map(
                        ids.map((id) => [id, categoryPerms.get(id) ?? false]),
                    ),
            ),
    }) as any;

describe('isChannelUnread', () => {
    it('never reports link channels as unread', () => {
        expect(
            isChannelUnread(channel({ type: 'link' }), undefined, true),
        ).toBe(false);
    });

    it('never reports channels the user cannot view as unread', () => {
        expect(isChannelUnread(channel(), undefined, false)).toBe(false);
    });

    it('is not unread when the channel has no messages', () => {
        expect(
            isChannelUnread(
                channel({ lastMessageAt: undefined }),
                undefined,
                true,
            ),
        ).toBe(false);
    });

    it('is unread when there is no read record', () => {
        expect(isChannelUnread(channel(), undefined, true)).toBe(true);
    });

    it('is unread when the read record predates the last message', () => {
        expect(
            isChannelUnread(
                channel(),
                new Date('2026-08-01T00:00:00.000Z'),
                true,
            ),
        ).toBe(true);
    });

    it('is read when the read record is newer than the last message', () => {
        expect(
            isChannelUnread(
                channel(),
                new Date('2026-09-26T17:23:52.986Z'),
                true,
            ),
        ).toBe(false);
    });
});

describe('resolveChannelVisibility', () => {
    it('requires both viewChannels and viewCategories', async () => {
        const permissionService = makePermissionService(
            new Map([['0336236036789108736', true]]),
            new Map([[CATEGORY, false]]),
        );

        const visibility = await resolveChannelVisibility(
            permissionService,
            SERVER,
            USER,
            [channel({ categoryId: CATEGORY })],
        );

        expect(visibility.get('0336236036789108736')).toBe(false);
    });

    it('is visible with viewChannels when the category grant is missing', async () => {
        const permissionService = makePermissionService(
            new Map([['0336236036789108736', true]]),
            new Map(),
        );

        const visibility = await resolveChannelVisibility(
            permissionService,
            SERVER,
            USER,
            [channel({ categoryId: null })],
        );

        expect(visibility.get('0336236036789108736')).toBe(true);
    });

    it('is hidden when viewChannels is denied', async () => {
        const permissionService = makePermissionService(
            new Map([['0336236036789108736', false]]),
            new Map([[CATEGORY, true]]),
        );

        const visibility = await resolveChannelVisibility(
            permissionService,
            SERVER,
            USER,
            [channel({ categoryId: CATEGORY })],
        );

        expect(visibility.get('0336236036789108736')).toBe(false);
    });

    it('queries viewChannels and viewCategories permission keys', async () => {
        const permissionService = makePermissionService(new Map(), new Map());

        await resolveChannelVisibility(permissionService, SERVER, USER, [
            channel({ categoryId: CATEGORY }),
        ]);

        expect(permissionService.hasChannelPermissions).toHaveBeenCalledWith(
            SERVER,
            USER,
            ['0336236036789108736'],
            'viewChannels',
        );
        expect(permissionService.hasCategoryPermissions).toHaveBeenCalledWith(
            SERVER,
            USER,
            [CATEGORY],
            'viewCategories',
        );
    });

    it('returns an empty map for an empty channel list', async () => {
        const permissionService = makePermissionService(new Map(), new Map());

        const visibility = await resolveChannelVisibility(
            permissionService,
            SERVER,
            USER,
            [],
        );

        expect(visibility.size).toBe(0);
        expect(permissionService.hasChannelPermissions).not.toHaveBeenCalled();
    });
});
