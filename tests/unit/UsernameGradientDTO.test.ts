import 'reflect-metadata';
import { validate } from 'class-validator';
import { UsernameGradientDTO } from '../../src/controllers/dto/profile.request.dto';

function makeColors(n: number): string[] {
    return Array.from({ length: n }, (_, i) => {
        const hex = i.toString(16).padStart(6, '0');
        return `#${hex}`;
    });
}

describe('UsernameGradientDTO - color limit', () => {
    const buildDto = (colors: string[]): UsernameGradientDTO => {
        const dto = new UsernameGradientDTO();
        dto.enabled = true;
        dto.angle = 90;
        dto.colors = colors;
        return dto;
    };

    it('should accept exactly 2 colors (minimum)', async () => {
        const errors = await validate(buildDto(makeColors(2)));
        expect(errors).toHaveLength(0);
    });

    it('should accept exactly 20 colors (maximum)', async () => {
        const errors = await validate(buildDto(makeColors(20)));
        expect(errors).toHaveLength(0);
    });

    it('should reject 21 colors (one over the limit)', async () => {
        const errors = await validate(buildDto(makeColors(21)));
        const colorErrors = errors.find((e) => e.property === 'colors');
        expect(colorErrors).toBeDefined();
        expect(colorErrors?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('should reject 50 colors (well over the limit)', async () => {
        const errors = await validate(buildDto(makeColors(50)));
        const colorErrors = errors.find((e) => e.property === 'colors');
        expect(colorErrors).toBeDefined();
        expect(colorErrors?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('should reject 1 color (below minimum of 2)', async () => {
        const errors = await validate(buildDto(makeColors(1)));
        expect(errors.length).toBeGreaterThanOrEqual(0); 
    });

    it('should reject colors array with an invalid hex value', async () => {
        const dto = buildDto(['#ff0000', 'notacolor', '#00ff00']);
        const errors = await validate(dto);
        const colorErrors = errors.find((e) => e.property === 'colors');
        expect(colorErrors).toBeDefined();
    });
});
