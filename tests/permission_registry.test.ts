import { Role } from '../src/models/Server';
import {
    getPermissionDefault,
    isPermissionKey,
    PERMISSION_KEYS,
} from '../src/permissions/types';
import { mapBotToServerPermissions } from '../src/utils/botPermissions';
import type { BotPermissions } from '../src/models/Bot';

describe('Permission registry', () => {
    it('keeps known production permission checks in the canonical registry', () => {
        expect(isPermissionKey('connect')).toBe(true);
        expect(isPermissionKey('viewCategories')).toBe(true);
        expect(isPermissionKey('bypassSlowmode')).toBe(true);
        expect(isPermissionKey('exportChannelMessages')).toBe(true);
        expect(isPermissionKey('export_channel_messages')).toBe(false);
        expect(isPermissionKey('manageStickers')).toBe(true);
    });

    it('defines every permission on the role schema with the registry default', () => {
        for (const key of PERMISSION_KEYS) {
            const path = Role.schema.path(`permissions.${key}`);
            const schemaPath = path as unknown as { defaultValue?: unknown };

            expect(path).toBeDefined();
            expect(schemaPath.defaultValue).toBe(getPermissionDefault(key));
        }
    });

    it('maps bot permissions only to known server role permissions', () => {
        const botPermissions: BotPermissions = {
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

        const mapped = mapBotToServerPermissions(botPermissions);

        for (const key of Object.keys(mapped)) {
            expect(isPermissionKey(key)).toBe(true);
        }
    });
});
