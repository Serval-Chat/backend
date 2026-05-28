import { validate } from 'class-validator';
import { UpdateSettingsRequestDTO } from '../../src/controllers/dto/settings.request.dto';

describe('UpdateSettingsRequestDTO', () => {
    it('should validate valid Google Font URLs', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.customFontUrl = 'https://fonts.googleapis.com/css2?family=Roboto';

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
    });

    it('should validate Google Font URLs with multiple families', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.customFontUrl = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans';

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
    });

    it('should fail on non-Google Font URLs', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.customFontUrl = 'https://malicious.com/style.css';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const firstError = errors[0];
        if (!firstError) throw new Error('Expected at least one error');
        expect(firstError.constraints).toHaveProperty('matches');
    });

    it('should fail on malformed Google Font URLs', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.customFontUrl = 'fonts.googleapis.com/css2?family=Roboto';

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should allow optional custom font fields', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.muteNotifications = true;

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
    });

    it('should allow valid keybind settings', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.keybinds = {
            'composer.focus': { code: 'Slash' },
            'debug.theme.next': { code: 'Digit4', alt: true },
            'debug.theme.previous': null,
        };

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
    });

    it('should reject invalid keybind action IDs', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.keybinds = {
            'invalid.action': { code: 'KeyA' },
            'theme.next': { code: 'Digit4', alt: true },
        };

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate customFontFamily length', async () => {
        const dto = new UpdateSettingsRequestDTO();
        dto.customFontFamily = 'a'.repeat(101);

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const firstError = errors[0];
        if (!firstError) throw new Error('Expected at least one error');
        expect(firstError.constraints).toHaveProperty('maxLength');
    });
});
