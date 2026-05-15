import {
    hashWebsiteVerificationToken,
    normalizeWebsite,
    resolveTxtRecordsViaDoh,
    verifyWebsiteTokenHash,
    WEBSITE_VERIFICATION_PREFIX,
} from './websiteConnections';

describe('websiteConnections', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('normalizes plain domains and https URLs', () => {
        expect(normalizeWebsite('ser.chat')).toMatchObject({
            value: 'ser.chat',
            normalizedValue: 'ser.chat',
            verificationRecordName: '_serchat.ser.chat',
        });

        expect(normalizeWebsite('https://SER.chat/')).toMatchObject({
            value: 'ser.chat',
            normalizedValue: 'ser.chat',
            verificationRecordName: '_serchat.ser.chat',
        });
    });

    it.each([
        'localhost',
        '127.0.0.1',
        '*.ser.chat',
        'ftp://ser.chat',
        'https://ser.chat/path',
        'https://ser.chat?x=1',
    ])('rejects invalid website %s', (website) => {
        expect(() => normalizeWebsite(website)).toThrow('Invalid website');
    });

    it('verifies token hashes without storing raw tokens', () => {
        const token = 'secret-token';
        const hash = hashWebsiteVerificationToken(token);

        expect(hash).not.toBe(token);
        expect(verifyWebsiteTokenHash(token, hash)).toBe(true);
        expect(verifyWebsiteTokenHash('wrong-token', hash)).toBe(false);
    });

    it('resolves TXT records from Cloudflare DoH', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                Answer: [
                    {
                        type: 16,
                        data: `"${WEBSITE_VERIFICATION_PREFIX}abc"`,
                    },
                ],
            }),
        } as Response);

        await expect(
            resolveTxtRecordsViaDoh('_serchat.ser.chat'),
        ).resolves.toEqual([`${WEBSITE_VERIFICATION_PREFIX}abc`]);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://1.1.1.1/dns-query?name=_serchat.ser.chat&type=TXT',
            { headers: { accept: 'application/dns-json' } },
        );
    });

    it('falls back to Google DoH when Cloudflare fails', async () => {
        global.fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('primary failed'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    Answer: [
                        {
                            type: 16,
                            data: `"${WEBSITE_VERIFICATION_PREFIX}fallback"`,
                        },
                    ],
                }),
            } as Response);

        await expect(
            resolveTxtRecordsViaDoh('_serchat.ser.chat'),
        ).resolves.toEqual([`${WEBSITE_VERIFICATION_PREFIX}fallback`]);
        expect(global.fetch).toHaveBeenLastCalledWith(
            'https://8.8.8.8/resolve?name=_serchat.ser.chat&type=TXT',
        );
    });
});
