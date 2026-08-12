import { SystemController } from '../SystemController';

describe('GET /api/v1/system/info', () => {
    it('does not disclose the full commit hash', async () => {
        const info = await new SystemController().getSystemInfo();

        expect(info).not.toHaveProperty('commitHash');
        expect(Object.keys(info).sort()).toEqual([
            'partialCommitHash',
            'version',
        ]);
    });

    it('still reports a short hash and a version', async () => {
        const info = await new SystemController().getSystemInfo();

        expect(typeof info.version).toBe('string');
        expect(info.partialCommitHash.length).toBeLessThanOrEqual(8);
    });
});
