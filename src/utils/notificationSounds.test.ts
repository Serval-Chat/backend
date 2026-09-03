import { withSoundDefaults } from './notificationSounds';

interface TestSound {
    id: string;
    volume?: number;
    normalizationGain?: number;
}

describe('withSoundDefaults', () => {
    it('defaults missing volume and normalizationGain to 1', () => {
        const input: TestSound = { id: 's1' };

        const result = withSoundDefaults(input);

        expect(result).toEqual({ id: 's1', volume: 1, normalizationGain: 1 });
    });

    it('keeps explicit volume and normalizationGain values', () => {
        const input: TestSound = {
            id: 's1',
            volume: 0.4,
            normalizationGain: 2.5,
        };

        const result = withSoundDefaults(input);

        expect(result.volume).toBe(0.4);
        expect(result.normalizationGain).toBe(2.5);
    });

    it('treats a value of 0 as explicit, not missing', () => {
        const input: TestSound = { id: 's1', volume: 0 };

        const result = withSoundDefaults(input);

        expect(result.volume).toBe(0);
    });
});
