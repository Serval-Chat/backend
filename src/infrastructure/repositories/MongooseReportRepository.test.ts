import { MongooseReportRepository } from './MongooseReportRepository';
import { ReportSettings } from '@/models/ReportSettings';
import { Report } from '@/models/Report';

describe('MongooseReportRepository report reason options', () => {
    afterEach(() => jest.restoreAllMocks());

    it('keeps legacy reasons for messages and adds profile defaults', async () => {
        const legacySettings = {
            options: [
                {
                    id: 'harassment',
                    label: 'Harassment or bullying',
                    enabled: true,
                    position: 0,
                    subcategories: [],
                },
            ],
        };
        const lean = jest.fn().mockResolvedValue(legacySettings);
        jest.spyOn(ReportSettings, 'findOneAndUpdate').mockReturnValue({
            lean,
        } as never);

        const options = await new MongooseReportRepository().getReasonOptions(
            true,
        );

        expect(options.find((option) => option.id === 'harassment')).toEqual(
            expect.objectContaining({ targetType: 'message' }),
        );
        expect(options).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'user_impersonation',
                    targetType: 'user',
                    label: 'Impersonation',
                }),
                expect.objectContaining({
                    id: 'user_spam',
                    targetType: 'user',
                    label: 'Spam or scam account',
                }),
            ]),
        );
    });
});

describe('MongooseReportRepository report review lifecycle', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each(['resolved', 'dismissed'] as const)(
        'clears saved profile image references when a report is %s',
        async (status) => {
            const id = '1234567890123456789';
            const data = {
                status,
                internalNote: 'Reviewed',
                reviewedBy: '2234567890123456789',
            };
            const lean = jest.fn().mockResolvedValue({
                snowflakeId: id,
                status,
            });
            const findOneAndUpdate = jest
                .spyOn(Report, 'findOneAndUpdate')
                .mockReturnValue({ lean } as never);

            await new MongooseReportRepository().updateReview(id, data);

            expect(findOneAndUpdate).toHaveBeenCalledWith(
                { snowflakeId: id },
                {
                    $set: data,
                    $unset: {
                        'userProfileSnapshot.snapshotKey': '',
                        'userProfileSnapshot.profilePictureFile': '',
                        'userProfileSnapshot.bannerFile': '',
                    },
                },
                { new: true, runValidators: true },
            );
        },
    );
});
