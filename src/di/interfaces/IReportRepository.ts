import type {
    ReportMessageSnapshot,
    ReportContextMessageSnapshot,
    ReportReason,
    ReportStatus,
    ReportTargetType,
    ReportUserProfileSnapshot,
} from '@/models/Report';
import type {
    ReportReasonOption,
    ReportReasonOptionDeletions,
    ReportReasonOptionInput,
} from '@/models/ReportSettings';

export interface IReport {
    _id: unknown;
    snowflakeId: string;
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    reasonLabel?: string;
    subReason?: string;
    subReasonLabel?: string;
    details?: string;
    serverId?: string;
    channelId?: string;
    targetUsername?: string;
    targetUserId?: string;
    messageSnapshot?: string;
    messageContent?: ReportMessageSnapshot;
    messageContext?: ReportContextMessageSnapshot[];
    userProfileSnapshot?: ReportUserProfileSnapshot;
    reportCount?: number;
    status: ReportStatus;
    internalNote?: string;
    reviewedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IReportRepository {
    findById?(id: string): Promise<IReport | null>;
    getReasonOptions(
        includeDisabled?: boolean,
        includeDeleted?: boolean,
    ): Promise<ReportReasonOption[]>;
    saveReasonOptions(
        options: ReportReasonOptionInput[],
        deletions?: ReportReasonOptionDeletions,
    ): Promise<ReportReasonOption[]>;
    create(
        data: Omit<
            IReport,
            | '_id'
            | 'snowflakeId'
            | 'status'
            | 'createdAt'
            | 'updatedAt'
            | 'internalNote'
            | 'reviewedBy'
        >,
    ): Promise<IReport>;
    findByReporter(reporterId: string): Promise<IReport[]>;
    findAll(options: {
        limit: number;
        offset: number;
        status?: ReportStatus;
        reportId?: string;
    }): Promise<IReport[]>;
    updateReview(
        id: string,
        data: {
            status: ReportStatus;
            internalNote?: string;
            reviewedBy: string;
        },
    ): Promise<IReport | null>;
}
