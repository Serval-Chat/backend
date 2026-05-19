import { updateRoleSchema } from '../src/validation/schemas/servers';

describe('Role Schema', () => {
    it('should parse seeDeletedMessages correctly', () => {
        const payload = {
            permissions: {
                seeDeletedMessages: true,
                manageChannels: false,
                connect: true,
                bypassSlowmode: true,
                exportChannelMessages: false,
                manageStickers: true,
            },
        };
        const parsed = updateRoleSchema.parse(payload);
        expect(parsed.permissions?.seeDeletedMessages).toBe(true);
        expect(parsed.permissions?.manageChannels).toBe(false);
        expect(parsed.permissions?.connect).toBe(true);
        expect(parsed.permissions?.bypassSlowmode).toBe(true);
        expect(parsed.permissions?.exportChannelMessages).toBe(false);
        expect(parsed.permissions?.manageStickers).toBe(true);
    });

    it('should normalize the legacy export permission key', () => {
        const parsed = updateRoleSchema.parse({
            permissions: {
                export_channel_messages: true,
            },
        });

        expect(parsed.permissions?.exportChannelMessages).toBe(true);
        expect(parsed.permissions).not.toHaveProperty('export_channel_messages');
    });

    it('should reject unknown permission keys', () => {
        expect(() =>
            updateRoleSchema.parse({
                permissions: {
                    sendMessages: true,
                    readMessageHistory: true,
                },
            }),
        ).toThrow();
    });
});
