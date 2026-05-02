import { updateRoleSchema } from '../src/validation/schemas/servers';

describe('Role Schema', () => {
    it('should parse seeDeletedMessages correctly', () => {
        const payload = {
            permissions: {
                seeDeletedMessages: true,
                manageChannels: false
            }
        };
        const parsed = updateRoleSchema.parse(payload);
        expect(parsed.permissions?.seeDeletedMessages).toBe(true);
        expect(parsed.permissions?.manageChannels).toBe(false);
    });
});
