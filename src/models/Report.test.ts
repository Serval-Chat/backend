import { Report } from './Report';

describe('Report message snapshots', () => {
    it('accepts a 10,000-character message snapshot', async () => {
        const messageText = 'x'.repeat(10_000);
        const report = new Report({
            reporterId: '2234567890123456789',
            targetType: 'message',
            targetId: '3234567890123456789',
            reason: 'spam',
            messageSnapshot: messageText,
            messageContent: { text: messageText },
        });

        await expect(report.validate()).resolves.toBeUndefined();
    });
});
