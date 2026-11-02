import type {
    IReport,
    IReportRepository,
} from '@/di/interfaces/IReportRepository';
import { Report } from '@/models/Report';
import type { ReportStatus } from '@/models/Report';
import {
    DEFAULT_REPORT_REASON_OPTIONS,
    ReportSettings,
    type ReportReasonOptionDeletions,
    type ReportReasonOption,
    type ReportReasonOptionInput,
    type ReportReasonSubcategory,
} from '@/models/ReportSettings';
import { generateSnowflakeId } from '@/utils/snowflake';
import type { UpdateQuery } from 'mongoose';

type StoredReportReasonOption = Omit<ReportReasonOption, 'targetType'> & {
    targetType?: ReportReasonOption['targetType'];
};

export class MongooseReportRepository implements IReportRepository {
    private normalizeSettings(settings: {
        options: StoredReportReasonOption[];
    }): {
        options: ReportReasonOption[];
    } {
        const options = settings.options.map((option) => ({
            ...option,
            targetType: option.targetType ?? 'message',
        }));
        if (
            !options.some(
                (option) =>
                    option.targetType === 'user' && option.deleted !== true,
            )
        ) {
            const nextPosition =
                Math.max(-1, ...options.map((option) => option.position)) + 1;
            options.push(
                ...DEFAULT_REPORT_REASON_OPTIONS.filter(
                    (option) => option.targetType === 'user',
                ).map((option, index) => ({
                    ...option,
                    position: nextPosition + index,
                })),
            );
        }
        return { options };
    }

    private async getOrCreateSettings(): Promise<{
        options: ReportReasonOption[];
    }> {
        try {
            const settings = await ReportSettings.findOneAndUpdate(
                { key: 'global' },
                { $setOnInsert: { options: DEFAULT_REPORT_REASON_OPTIONS } },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            ).lean();
            return this.normalizeSettings(settings);
        } catch (error) {
            if (
                typeof error !== 'object' ||
                error === null ||
                !('code' in error) ||
                error.code !== 11000
            ) {
                throw error;
            }
        }

        const settings = await ReportSettings.findOne({ key: 'global' }).lean();
        if (!settings) throw new Error('Report settings could not be loaded');
        return this.normalizeSettings(settings);
    }

    public async getReasonOptions(
        includeDisabled = false,
        includeDeleted = false,
    ): Promise<ReportReasonOption[]> {
        const settings = await this.getOrCreateSettings();
        return settings.options
            .filter(
                (option) =>
                    (includeDisabled || option.enabled) &&
                    (includeDeleted || option.deleted !== true),
            )
            .map((option) => {
                const visibleOption = { ...option };
                delete visibleOption.deleted;
                return {
                    ...visibleOption,
                    subcategories: (option.subcategories ?? [])
                        .filter(
                            (subcategory) =>
                                (includeDisabled || subcategory.enabled) &&
                                (includeDeleted ||
                                    subcategory.deleted !== true),
                        )
                        .sort((a, b) => a.position - b.position)
                        .map((subcategory) => {
                            const visibleSubcategory = { ...subcategory };
                            delete visibleSubcategory.deleted;
                            return visibleSubcategory;
                        }),
                };
            })
            .sort((a, b) => a.position - b.position);
    }

    public async saveReasonOptions(
        options: ReportReasonOptionInput[],
        deletions: ReportReasonOptionDeletions = {
            reasonIds: [],
            subcategoryIds: [],
        },
    ): Promise<ReportReasonOption[]> {
        const settings = await this.getOrCreateSettings();
        const deletedReasonIds = new Set(deletions.reasonIds);
        const deletedSubcategoryIds = new Set(deletions.subcategoryIds);
        const submittedIds = new Set(
            options
                .map((option) => option.id)
                .filter((id): id is string => id !== undefined),
        );
        const submitted = options.map((option, position) => {
            const id = option.id ?? `reason_${generateSnowflakeId()}`;
            const existing = settings.options.find(
                (current) => current.id === id,
            );
            const submittedSubcategoryIds = new Set(
                (option.subcategories ?? [])
                    .map((subcategory) => subcategory.id)
                    .filter((subcategoryId): subcategoryId is string =>
                        Boolean(subcategoryId),
                    ),
            );
            const subcategories = (option.subcategories ?? []).map(
                (subcategory, subcategoryPosition) => ({
                    id: subcategory.id ?? `subreason_${generateSnowflakeId()}`,
                    label: subcategory.label.trim(),
                    enabled: subcategory.enabled,
                    position: subcategoryPosition,
                }),
            );
            const retainedDisabledSubcategories = (
                existing?.subcategories ?? []
            )
                .filter(
                    (subcategory) =>
                        !submittedSubcategoryIds.has(subcategory.id),
                )
                .map((subcategory, subcategoryIndex) => ({
                    ...subcategory,
                    enabled: false,
                    deleted:
                        subcategory.deleted === true ||
                        deletedSubcategoryIds.has(subcategory.id),
                    position: subcategories.length + subcategoryIndex,
                }));

            return {
                id,
                label: option.label.trim(),
                enabled: option.enabled,
                position,
                subcategories: [
                    ...subcategories,
                    ...retainedDisabledSubcategories,
                ],
            };
        });
        const retainedDisabled = settings.options
            .filter((option) => !submittedIds.has(option.id))
            .map((option, index) => ({
                ...option,
                enabled: false,
                deleted:
                    option.deleted === true || deletedReasonIds.has(option.id),
                position: submitted.length + index,
                subcategories: (option.subcategories ?? []).map(
                    (subcategory: ReportReasonSubcategory) => ({
                        ...subcategory,
                        enabled: false,
                        deleted:
                            subcategory.deleted === true ||
                            deletedSubcategoryIds.has(subcategory.id),
                    }),
                ),
            }));
        const updated = await ReportSettings.findOneAndUpdate(
            { key: 'global' },
            { $set: { options: [...submitted, ...retainedDisabled] } },
            { new: true, runValidators: true },
        ).lean();
        return (updated?.options ?? [])
            .filter((option) => option.deleted !== true)
            .map((option) => {
                const visibleOption = { ...option };
                delete visibleOption.deleted;
                return {
                    ...visibleOption,
                    subcategories: (option.subcategories ?? [])
                        .filter((subcategory) => subcategory.deleted !== true)
                        .map((subcategory) => {
                            const visibleSubcategory = { ...subcategory };
                            delete visibleSubcategory.deleted;
                            return visibleSubcategory;
                        }),
                };
            })
            .sort((a, b) => a.position - b.position);
    }

    public async create(
        data: Parameters<IReportRepository['create']>[0],
    ): Promise<IReport> {
        const duplicateQuery = {
            reporterId: data.reporterId,
            targetType: data.targetType,
            targetId: data.targetId,
        };
        const existing = await Report.findOne(duplicateQuery).lean();
        if (existing) return existing;

        const dedupeKey = `${data.targetType}:${data.targetId}:${data.reporterId}`;
        try {
            const report = await Report.create({ ...data, dedupeKey });
            return report.toObject();
        } catch (error) {
            if (
                typeof error !== 'object' ||
                error === null ||
                !('code' in error) ||
                error.code !== 11000
            ) {
                throw error;
            }

            const racedReport = await Report.findOne(duplicateQuery).lean();
            if (!racedReport) throw error;
            return racedReport;
        }
    }

    public async findById(id: string): Promise<IReport | null> {
        return Report.findOne({ snowflakeId: id }).lean();
    }

    public async findByReporter(reporterId: string): Promise<IReport[]> {
        return Report.find({ reporterId }).sort({ createdAt: -1 }).lean();
    }

    public async findAll(options: {
        limit: number;
        offset: number;
        status?: ReportStatus;
        reportId?: string;
    }): Promise<IReport[]> {
        const match: Record<string, string> = {};
        if (options.status) match.status = options.status;
        if (options.reportId !== undefined && options.reportId.length > 0) {
            match.snowflakeId = options.reportId;
        }
        const reports = await Report.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: Report.collection.name,
                    let: {
                        targetType: '$targetType',
                        targetId: '$targetId',
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $eq: [
                                                '$targetType',
                                                '$$targetType',
                                            ],
                                        },
                                        {
                                            $eq: ['$targetId', '$$targetId'],
                                        },
                                    ],
                                },
                            },
                        },
                        { $group: { _id: '$reporterId' } },
                        { $count: 'count' },
                    ],
                    as: 'reporterCounts',
                },
            },
            {
                $addFields: {
                    reportCount: {
                        $ifNull: [
                            { $arrayElemAt: ['$reporterCounts.count', 0] },
                            0,
                        ],
                    },
                },
            },
            { $sort: { reportCount: -1, createdAt: -1, _id: 1 } },
            { $skip: options.offset },
            { $limit: options.limit },
            { $project: { reporterCounts: 0, dedupeKey: 0 } },
        ]).exec();
        return reports as IReport[];
    }

    public async updateReview(
        id: string,
        data: {
            status: ReportStatus;
            internalNote?: string;
            reviewedBy: string;
        },
    ): Promise<IReport | null> {
        const update: UpdateQuery<IReport> = { $set: data };
        if (data.status === 'resolved' || data.status === 'dismissed') {
            update.$unset = {
                'userProfileSnapshot.snapshotKey': '',
                'userProfileSnapshot.profilePictureFile': '',
                'userProfileSnapshot.bannerFile': '',
            };
        }
        return Report.findOneAndUpdate({ snowflakeId: id }, update, {
            new: true,
            runValidators: true,
        }).lean();
    }
}
