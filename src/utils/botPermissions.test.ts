import {
    bitmaskToPermissions,
    permissionsToBitmask,
    BOT_PERMISSION_BITS,
    mapBotToServerPermissions,
} from './botPermissions';
import { BOT_PERMISSION_KEYS } from '../models/Bot';
import type { BotPermissions } from '../models/Bot';

describe('botPermissions utility', () => {
    const makePermissions = (value: boolean): BotPermissions =>
        Object.fromEntries(
            BOT_PERMISSION_KEYS.map((key) => [key, value]),
        ) as BotPermissions;

    const allOn = makePermissions(true);

    const allOff = makePermissions(false);

    const partial: BotPermissions = {
        ...allOff,
        readMessages: true,
        sendMessages: true,
        manageServer: true,
        manageRoles: true,
        exportChannelMessages: true,
    };

    test('permissionsToBitmask should convert all true to correct bitmask', () => {
        const expected = Object.values(BOT_PERMISSION_BITS).reduce(
            (a, b) => a | b,
            0,
        );
        expect(permissionsToBitmask(allOn)).toBe(expected);
    });

    test('permissionsToBitmask should convert all false to 0', () => {
        expect(permissionsToBitmask(allOff)).toBe(0);
    });

    test('permissionsToBitmask should convert partial permissions correctly', () => {
        const expected =
            BOT_PERMISSION_BITS.readMessages |
            BOT_PERMISSION_BITS.sendMessages |
            BOT_PERMISSION_BITS.manageServer |
            BOT_PERMISSION_BITS.manageRoles |
            BOT_PERMISSION_BITS.exportChannelMessages;
        expect(permissionsToBitmask(partial)).toBe(expected);
    });

    test('bitmaskToPermissions should convert 0 to all false', () => {
        expect(bitmaskToPermissions(0)).toEqual(allOff);
    });

    test('bitmaskToPermissions should convert partial bitmask correctly', () => {
        const mask =
            BOT_PERMISSION_BITS.readMessages |
            BOT_PERMISSION_BITS.sendMessages |
            BOT_PERMISSION_BITS.manageServer |
            BOT_PERMISSION_BITS.manageRoles |
            BOT_PERMISSION_BITS.exportChannelMessages;
        expect(bitmaskToPermissions(mask)).toEqual(partial);
    });

    test('should be reversible', () => {
        const mask = permissionsToBitmask(partial);
        expect(bitmaskToPermissions(mask)).toEqual(partial);

        const restoredMask = permissionsToBitmask(bitmaskToPermissions(mask));
        expect(restoredMask).toBe(mask);
    });

    describe('mapBotToServerPermissions', () => {
        test('should map permissions correctly', () => {
            const mapped = mapBotToServerPermissions(partial);
            expect(mapped.viewChannels).toBe(true);
            expect(mapped.sendMessages).toBe(true);
            expect(mapped.manageServer).toBe(true);
            expect(mapped.manageRoles).toBe(true);
            expect(mapped.exportChannelMessages).toBe(true);
            expect(mapped.manageChannels).toBe(false);
            expect(mapped.moderateMembers).toBe(false);
            expect(mapBotToServerPermissions(allOn).moderateMembers).toBe(true);
        });

        test('should preserve disabled bot permissions', () => {
            const mapped = mapBotToServerPermissions(allOff);
            expect(mapped.connect).toBe(false);
            expect(mapped.viewChannels).toBe(false);
        });
    });
});
