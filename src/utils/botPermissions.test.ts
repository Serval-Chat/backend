import {
    bitmaskToPermissions,
    permissionsToBitmask,
    BOT_PERMISSION_BITS,
    mapBotToServerPermissions,
} from './botPermissions';
import type { BotPermissions } from '../models/Bot';

describe('botPermissions utility', () => {
    const allOn: BotPermissions = {
        readMessages: true,
        sendMessages: true,
        manageMessages: true,
        readUsers: true,
        joinServers: true,
        manageServer: true,
        manageChannels: true,
        manageMembers: true,
        readReactions: true,
        addReactions: true,
    };

    const allOff: BotPermissions = {
        readMessages: false,
        sendMessages: false,
        manageMessages: false,
        readUsers: false,
        joinServers: false,
        manageServer: false,
        manageChannels: false,
        manageMembers: false,
        readReactions: false,
        addReactions: false,
    };

    const partial: BotPermissions = {
        ...allOff,
        readMessages: true,
        sendMessages: true,
        manageServer: true,
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
            BOT_PERMISSION_BITS.manageServer;
        expect(permissionsToBitmask(partial)).toBe(expected);
    });

    test('bitmaskToPermissions should convert 0 to all false', () => {
        expect(bitmaskToPermissions(0)).toEqual(allOff);
    });

    test('bitmaskToPermissions should convert partial bitmask correctly', () => {
        const mask =
            BOT_PERMISSION_BITS.readMessages |
            BOT_PERMISSION_BITS.sendMessages |
            BOT_PERMISSION_BITS.manageServer;
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
            expect(mapped.manageChannels).toBe(false);
            expect(mapped.readMessageHistory).toBe(true); // Based on readMessages
        });

        test('should always include default bot permissions', () => {
            const mapped = mapBotToServerPermissions(allOff);
            expect(mapped.connect).toBe(true);
        });
    });
});
