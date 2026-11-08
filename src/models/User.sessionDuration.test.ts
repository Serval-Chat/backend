import { SessionDuration, sessionDurationFor } from '@/models/User';

describe('sessionDurationFor', () => {
    it("uses the user's chosen duration", () => {
        expect(
            sessionDurationFor({
                settings: { sessionDuration: SessionDuration.ONE_DAY },
            }),
        ).toBe('1d');
    });

    it('defaults to thirty days', () => {
        expect(sessionDurationFor({})).toBe(SessionDuration.THIRTY_DAYS);
        expect(sessionDurationFor({ settings: {} })).toBe(
            SessionDuration.THIRTY_DAYS,
        );
    });
});
