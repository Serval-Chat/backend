import {
    hashWebsiteVerificationToken,
    getWebsiteVerificationFileUrl,
    isWebsiteVerificationFileContent,
    isWebsiteVerificationRecord,
    normalizeWebsite,
    resolveTxtRecordsViaDoh,
    verifyWebsiteTokenHash,
    WEBSITE_VERIFICATION_PREFIX,
} from './websiteConnections';

describe('websiteConnections', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('normalizes plain domains and https URLs', () => {
        expect(normalizeWebsite('ser.chat')).toMatchObject({
            value: 'ser.chat',
            normalizedValue: 'ser.chat',
            verificationRecordName: '_serchat.ser.chat',
            verificationFilePath: '/.well-known/serchat',
            verificationFileUrl: 'https://ser.chat/.well-known/serchat',
        });

        expect(normalizeWebsite('https://SER.chat/')).toMatchObject({
            value: 'ser.chat',
            normalizedValue: 'ser.chat',
            verificationRecordName: '_serchat.ser.chat',
            verificationFilePath: '/.well-known/serchat',
            verificationFileUrl: 'https://ser.chat/.well-known/serchat',
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

    it('matches DNS TXT records and HTTPS file contents against token hashes', () => {
        const token = 'secret-token';
        const hash = hashWebsiteVerificationToken(token);

        expect(
            isWebsiteVerificationRecord(
                `${WEBSITE_VERIFICATION_PREFIX}${token}`,
                hash,
            ),
        ).toBe(true);
        expect(isWebsiteVerificationRecord('unrelated', hash)).toBe(false);
        expect(isWebsiteVerificationFileContent(`${token}\n`, hash)).toBe(true);
        expect(isWebsiteVerificationFileContent('wrong-token', hash)).toBe(
            false,
        );
    });

    it('builds HTTPS verification file URLs', () => {
        expect(getWebsiteVerificationFileUrl('ser.chat')).toBe(
            'https://ser.chat/.well-known/serchat',
        );
    });

    it('resolves TXT records from Cloudflare DoH', async () => {
        const fetchText = jest.fn().mockResolvedValue(
            JSON.stringify({
                Answer: [
                    {
                        type: 16,
                        data: `"${WEBSITE_VERIFICATION_PREFIX}abc"`,
                    },
                ],
            }),
        );

        await expect(
            resolveTxtRecordsViaDoh('_serchat.ser.chat', fetchText),
        ).resolves.toEqual([`${WEBSITE_VERIFICATION_PREFIX}abc`]);
        expect(fetchText).toHaveBeenCalledWith(
            'https://1.1.1.1/dns-query?name=_serchat.ser.chat&type=TXT',
        );
    });

    it('falls back to Google DoH when Cloudflare fails', async () => {
        const fetchText = jest
            .fn()
            .mockRejectedValueOnce(new Error('primary failed'))
            .mockResolvedValueOnce(
                JSON.stringify({
                    Answer: [
                        {
                            type: 16,
                            data: `"${WEBSITE_VERIFICATION_PREFIX}fallback"`,
                        },
                    ],
                }),
            );

        await expect(
            resolveTxtRecordsViaDoh('_serchat.ser.chat', fetchText),
        ).resolves.toEqual([`${WEBSITE_VERIFICATION_PREFIX}fallback`]);
        expect(fetchText).toHaveBeenLastCalledWith(
            'https://8.8.8.8/resolve?name=_serchat.ser.chat&type=TXT',
        );
    });
});
