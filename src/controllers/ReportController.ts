import {
    Body,
    BadRequestException,
    Controller,
    Get,
    Inject,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Res,
    UseGuards,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { AuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { TYPES } from '@/di/types';
import type {
    IReportRepository,
    IReport,
} from '@/di/interfaces/IReportRepository';
import type {
    IMessage,
    IMessageWithEditHistory,
} from '@/di/interfaces/IMessageRepository';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import type { IChannelRepository } from '@/di/interfaces/IChannelRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type {
    ReportContextMessageSnapshot,
    ReportMessageEditSnapshot,
    ReportMessageSnapshot,
    ReportStatus,
    ReportUserProfileSnapshot,
} from '@/models/Report';
import type { ReportReasonOption } from '@/models/ReportSettings';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import {
    createReportUserProfileSnapshot,
    deleteReportUserProfileSnapshotImages,
    getReportUserProfileImagePath,
} from '@/utils/reportUserProfileSnapshot';
import {
    CreateReportRequestDTO,
    UpdateReportRequestDTO,
    UpdateReportReasonOptionsRequestDTO,
} from './dto/report.request.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/v1')
export class ReportController {
    public constructor(
        @Inject(TYPES.ReportRepository) private reportRepo: IReportRepository,
        @Inject(TYPES.UserRepository) private userRepo: IUserRepository,
        @Inject(TYPES.MessageRepository)
        private messageRepo: IMessageRepository,
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.WsServer) private wsServer: IWsServer,
    ) {}

    private async requireMessageVisibility(
        message: IMessage,
        userId: string,
    ): Promise<boolean> {
        if (message.serverId !== undefined) {
            const member = await this.serverMemberRepo.findByServerAndUser(
                message.serverId,
                userId,
            );
            if (member === null) {
                throw new NotFoundException('Report target not found');
            }

            const channel = await this.channelRepo.findById(message.channelId);
            if (
                channel === null ||
                channel.type === 'link' ||
                channel.serverId?.toString() !== message.serverId
            ) {
                throw new NotFoundException('Report target not found');
            }

            await this.permissionService.requireChannelPermission(
                message.serverId,
                userId,
                message.channelId,
                'viewChannels',
                new NotFoundException('Report target not found'),
            );
            const canSeeDeletedMessage =
                await this.permissionService.hasChannelPermission(
                    message.serverId,
                    userId,
                    message.channelId,
                    'seeDeletedMessages',
                );
            if (message.deletedAt && !canSeeDeletedMessage) {
                throw new NotFoundException('Report target not found');
            }
            return canSeeDeletedMessage;
        }

        const channel = await this.channelRepo.findById(message.channelId);
        if (
            channel === null ||
            (channel.type !== 'dm' && channel.type !== 'group_dm') ||
            !(channel.recipientIds ?? []).includes(userId)
        ) {
            throw new NotFoundException('Report target not found');
        }
        return false;
    }

    @Get('reports/options')
    @ApiOperation({ summary: 'List active report reasons' })
    @ApiQuery({
        name: 'targetType',
        required: false,
        enum: ['message', 'user'],
    })
    public async getReportReasonOptions(
        @Query('targetType') targetType?: string,
    ): Promise<
        (Pick<ReportReasonOption, 'id' | 'targetType' | 'label'> & {
            subcategories: Pick<
                NonNullable<ReportReasonOption['subcategories']>[number],
                'id' | 'label'
            >[];
        })[]
    > {
        if (
            targetType !== undefined &&
            targetType !== 'message' &&
            targetType !== 'user'
        ) {
            throw new BadRequestException('Invalid report target type');
        }
        const options = await this.reportRepo.getReasonOptions();
        return options
            .filter(
                (option) =>
                    targetType === undefined ||
                    option.targetType === targetType,
            )
            .map(
                ({
                    id,
                    targetType: optionTargetType,
                    label,
                    subcategories,
                }) => ({
                    id,
                    targetType: optionTargetType,
                    label,
                    subcategories: (subcategories ?? []).map(
                        ({ id, label }) => ({
                            id,
                            label,
                        }),
                    ),
                }),
            );
    }

    @Get('admin/reports/options')
    @Permissions('viewReports')
    @ApiOperation({ summary: 'List all report reasons for staff settings' })
    public getAdminReportReasonOptions(): Promise<ReportReasonOption[]> {
        return this.reportRepo.getReasonOptions(true);
    }

    @Put('admin/reports/options')
    @Permissions('viewReports')
    @ApiOperation({ summary: 'Replace the configured report reasons' })
    public async updateReportReasonOptions(
        @Body() body: UpdateReportReasonOptionsRequestDTO,
    ): Promise<ReportReasonOption[]> {
        const ids = body.options
            .flatMap((option) => [
                ...(option.id === undefined ? [] : [option.id]),
                ...(option.subcategories ?? []).flatMap((subcategory) =>
                    subcategory.id === undefined ? [] : [subcategory.id],
                ),
            ])
            .concat(body.deleteReasonIds ?? [])
            .concat(body.deleteSubcategoryIds ?? []);
        if (new Set(ids).size !== ids.length) {
            throw new BadRequestException('Report reason IDs must be unique');
        }
        const options = body.options.map((option) => ({
            ...option,
            label: option.label.trim(),
            subcategories: (option.subcategories ?? []).map((subcategory) => ({
                ...subcategory,
                label: subcategory.label.trim(),
            })),
        }));
        if (
            options.some(
                (option) =>
                    option.label.length === 0 ||
                    option.subcategories.some(
                        (subcategory) => subcategory.label.length === 0,
                    ),
            )
        ) {
            throw new BadRequestException(
                'Report reason labels cannot be empty',
            );
        }
        if (
            !(['message', 'user'] as const).every((targetType) =>
                options.some(
                    (option) =>
                        option.targetType === targetType && option.enabled,
                ),
            )
        ) {
            throw new BadRequestException(
                'At least one reason for each target type must be enabled',
            );
        }
        return this.reportRepo.saveReasonOptions(options, {
            reasonIds: body.deleteReasonIds ?? [],
            subcategoryIds: body.deleteSubcategoryIds ?? [],
        });
    }

    @Post('reports')
    @ApiOperation({ summary: 'Submit a message or user report' })
    public async create(
        @Body() body: CreateReportRequestDTO,
        @CurrentUser('id') reporterId: string,
    ): Promise<ReportSubmissionResponse> {
        const reasonOption = (await this.reportRepo.getReasonOptions()).find(
            (option) =>
                option.id === body.reason &&
                option.targetType === body.targetType,
        );
        if (reasonOption === undefined || reasonOption.enabled !== true) {
            throw new BadRequestException('Invalid report reason');
        }
        const subReasonOption =
            body.subReason !== undefined
                ? reasonOption.subcategories?.find(
                      (option) => option.id === body.subReason,
                  )
                : undefined;
        if (body.subReason !== undefined && subReasonOption?.enabled !== true) {
            throw new BadRequestException('Invalid report subcategory');
        }

        if (body.targetType === 'user') {
            if (body.targetId === reporterId) {
                throw new ForbiddenException('You cannot report yourself');
            }
            const target = await this.userRepo.findById(body.targetId);
            if (!target || target.deletedAt)
                throw new NotFoundException('Report target not found');
            const isOnline =
                target.presenceStatus !== 'offline' &&
                (await this.wsServer.isUserOnline(target.snowflakeId));
            const snapshotPresenceStatus = isOnline
                ? (target.presenceStatus ?? 'online')
                : 'offline';
            const userProfileSnapshot = await createReportUserProfileSnapshot(
                target,
                snapshotPresenceStatus,
            );
            let report: IReport;
            try {
                report = await this.reportRepo.create({
                    reporterId,
                    targetType: 'user',
                    targetId: body.targetId,
                    reason: body.reason,
                    reasonLabel: reasonOption.label,
                    subReason: subReasonOption?.id,
                    subReasonLabel: subReasonOption?.label,
                    details: body.details,
                    targetUsername:
                        target.username ?? target.displayName ?? 'Unknown user',
                    targetUserId: target.snowflakeId,
                    userProfileSnapshot,
                });
            } catch (error) {
                await deleteReportUserProfileSnapshotImages(
                    userProfileSnapshot,
                );
                throw error;
            }
            if (
                report.userProfileSnapshot?.snapshotKey !==
                userProfileSnapshot.snapshotKey
            ) {
                await deleteReportUserProfileSnapshotImages(
                    userProfileSnapshot,
                );
            }
            return reportSubmission(report);
        }

        const message = await this.messageRepo.findById(body.targetId, true);
        if (!message || message.senderId === reporterId) {
            throw new NotFoundException('Report target not found');
        }
        const canSeeDeletedContext = await this.requireMessageVisibility(
            message,
            reporterId,
        );
        const contextMessages = await this.messageRepo.findContextAround(
            message.channelId,
            message.snowflakeId,
            10,
            10,
            canSeeDeletedContext,
        );
        const contextAuthors = await this.userRepo.findByIds([
            ...new Set(contextMessages.map((context) => context.senderId)),
        ]);
        const contextAuthorsById = new Map(
            contextAuthors.map((contextAuthor) => [
                contextAuthor.snowflakeId,
                contextAuthor,
            ]),
        );
        const targetContext = contextMessages.find(
            (context) => context.snowflakeId === message.snowflakeId,
        );
        const snapshotMessage = targetContext
            ? {
                  ...message,
                  text: targetContext.text,
                  editedAt: targetContext.editedAt,
                  isEdited: targetContext.isEdited,
              }
            : message;
        const messageContext = contextMessages.map((context) => {
            const contextAuthor = contextAuthorsById.get(context.senderId);
            return reportContextMessageSnapshot(
                context,
                contextAuthor?.displayName ??
                    contextAuthor?.username ??
                    contextAuthor?.anonymizedUsername ??
                    context.anonymizedSender ??
                    'Unknown user',
                context.snowflakeId === message.snowflakeId,
            );
        });
        const author = await this.userRepo.findById(message.senderId);
        const report = await this.reportRepo.create({
            reporterId,
            targetType: 'message',
            targetId: body.targetId,
            reason: body.reason,
            reasonLabel: reasonOption.label,
            subReason: subReasonOption?.id,
            subReasonLabel: subReasonOption?.label,
            details: body.details,
            serverId: message.serverId,
            channelId: message.channelId,
            targetUsername:
                author?.username ?? message.anonymizedSender ?? 'Unknown user',
            targetUserId: message.senderId,
            messageSnapshot: snapshotMessage.text,
            messageContent: reportMessageSnapshot(
                snapshotMessage,
                snapshotMessage.text,
                targetContext?.editHistory,
            ),
            messageContext,
        });
        return reportSubmission(report);
    }

    @Get('reports/me')
    @ApiOperation({ summary: 'List reports submitted by the current user' })
    public async getMine(
        @CurrentUser('id') reporterId: string,
    ): Promise<PublicReport[]> {
        const [reports, options] = await Promise.all([
            this.reportRepo.findByReporter(reporterId),
            this.reportRepo.getReasonOptions(true, true),
        ]);
        const optionsById = new Map(
            options.map((option) => [option.id, option]),
        );
        return reports.map((report) => {
            const reasonOption = optionsById.get(report.reason);
            const subReasonLabel = reasonOption?.subcategories?.find(
                (option) => option.id === report.subReason,
            )?.label;
            return publicReport(report, reasonOption?.label, subReasonLabel);
        });
    }

    @Get('admin/reports')
    @Permissions('viewReports')
    @ApiOperation({ summary: 'List reports for staff review' })
    public async getQueue(
        @Query('status') status?: ReportStatus,
        @Query('limit') limitRaw?: string,
        @Query('offset') offsetRaw?: string,
        @Query('reportId') reportIdRaw?: string,
    ): Promise<StaffReport[]> {
        if (
            status !== undefined &&
            !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)
        ) {
            throw new BadRequestException('Invalid report status');
        }
        const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 100);
        const offset = Math.max(Number(offsetRaw) || 0, 0);
        const reportId = reportIdRaw?.trim();
        const [reports, reasonOptions] = await Promise.all([
            this.reportRepo.findAll({
                limit,
                offset,
                status,
                ...(reportId !== undefined && reportId.length > 0
                    ? { reportId }
                    : {}),
            }),
            this.reportRepo.getReasonOptions(true, true),
        ]);
        const reasonOptionsById = new Map(
            reasonOptions.map((option) => [option.id, option]),
        );
        const reportsWithTargets = await Promise.all(
            reports.map(async (report) => {
                let message: IMessage | null = null;
                if (
                    report.targetType === 'message' &&
                    (report.targetUserId === undefined ||
                        report.messageContent === undefined)
                ) {
                    message = await this.messageRepo
                        .findById(report.targetId, true)
                        .catch(() => null);
                }
                return {
                    ...report,
                    targetUserId: report.targetUserId ?? message?.senderId,
                    messageContent:
                        report.messageContent ??
                        (message
                            ? {
                                  ...reportMessageSnapshot(
                                      message,
                                      report.messageSnapshot ?? message.text,
                                  ),
                                  isPartialSnapshot: true,
                              }
                            : undefined),
                };
            }),
        );
        if (reportsWithTargets.length === 0) return [];

        const reporters = await this.userRepo.findByIds([
            ...new Set(reportsWithTargets.map((report) => report.reporterId)),
        ]);
        const reportersById = new Map(
            reporters.map((user) => [user.snowflakeId, user]),
        );

        return reportsWithTargets.map((report) => {
            const reporter = reportersById.get(report.reporterId);
            return staffReport(
                report,
                reporter?.displayName ??
                    reporter?.username ??
                    reporter?.anonymizedUsername,
                report.reasonLabel ??
                    reasonOptionsById.get(report.reason)?.label,
                report.subReasonLabel ??
                    reasonOptionsById
                        .get(report.reason)
                        ?.subcategories?.find(
                            (option) => option.id === report.subReason,
                        )?.label,
            );
        });
    }

    @Get('admin/reports/:id/profile-image/:kind')
    @Permissions('viewReports')
    @ApiOperation({ summary: 'Get an active report profile snapshot image' })
    public async getUserProfileSnapshotImage(
        @Param('id') id: string,
        @Param('kind') kind: string,
        @Res() res: Response,
    ): Promise<void> {
        if (kind !== 'avatar' && kind !== 'banner') {
            throw new BadRequestException('Invalid profile image kind');
        }

        const report = await this.reportRepo.findById?.(id);
        if (
            !report ||
            (report.status !== 'open' && report.status !== 'reviewing') ||
            !report.userProfileSnapshot
        ) {
            throw new NotFoundException('Report profile image not found');
        }

        const imagePath = getReportUserProfileImagePath(
            report.userProfileSnapshot,
            kind,
        );
        if (imagePath === undefined || !fs.existsSync(imagePath)) {
            throw new NotFoundException('Report profile image not found');
        }

        const resolvedDirectory = path.resolve(
            process.cwd(),
            'uploads',
            'report-snapshots',
        );
        const resolvedImagePath = path.resolve(imagePath);
        if (!resolvedImagePath.startsWith(`${resolvedDirectory}${path.sep}`)) {
            throw new NotFoundException('Report profile image not found');
        }

        res.setHeader('Cache-Control', 'private, no-store');
        res.sendFile(resolvedImagePath);
    }

    @Patch('admin/reports/:id')
    @Permissions('viewReports')
    @ApiOperation({ summary: 'Update a report status and internal note' })
    public async update(
        @Param('id') id: string,
        @Body() body: UpdateReportRequestDTO,
        @CurrentUser('id') reviewerId: string,
    ): Promise<StaffReport> {
        const reportBeforeUpdate =
            body.status === 'resolved' || body.status === 'dismissed'
                ? await this.reportRepo.findById?.(id)
                : null;
        const report = await this.reportRepo.updateReview(id, {
            status: body.status,
            internalNote: body.internalNote,
            reviewedBy: reviewerId,
        });
        if (!report) throw new NotFoundException('Report not found');
        if (
            (body.status === 'resolved' || body.status === 'dismissed') &&
            reportBeforeUpdate?.userProfileSnapshot
        ) {
            await deleteReportUserProfileSnapshotImages(
                reportBeforeUpdate.userProfileSnapshot,
            );
        }
        return staffReport(report);
    }
}

interface PublicReport {
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    reasonLabel?: string;
    subReason?: string;
    subReasonLabel?: string;
    status: ReportStatus;
    createdAt: Date;
}

type ReportSubmissionResponse = Omit<PublicReport, 'status'>;

interface StaffReport extends PublicReport {
    reportCount?: number;
    reporterId: string;
    reporterUsername?: string;
    details?: string;
    serverId?: string;
    channelId?: string;
    targetUsername?: string;
    targetUserId?: string;
    messageSnapshot?: string;
    messageContent?: IReport['messageContent'];
    messageContext?: IReport['messageContext'];
    userProfileSnapshot?: StaffReportUserProfileSnapshot;
    internalNote?: string;
    reviewedBy?: string;
}

type StaffReportUserProfileSnapshot = Omit<
    ReportUserProfileSnapshot,
    'snapshotKey' | 'profilePictureFile' | 'bannerFile'
> & {
    profilePictureAvailable?: boolean;
    bannerAvailable?: boolean;
};

function publicReport(
    report: IReport,
    reasonLabel?: string,
    subReasonLabel?: string,
): PublicReport {
    return {
        id: report.snowflakeId,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        reasonLabel: report.reasonLabel ?? reasonLabel,
        subReason: report.subReason,
        subReasonLabel: report.subReasonLabel ?? subReasonLabel,
        status: report.status,
        createdAt: report.createdAt,
    };
}

function reportSubmission(report: IReport): ReportSubmissionResponse {
    const response = publicReport(report);
    return {
        id: response.id,
        targetType: response.targetType,
        targetId: response.targetId,
        reason: response.reason,
        reasonLabel: response.reasonLabel,
        subReason: response.subReason,
        subReasonLabel: response.subReasonLabel,
        createdAt: response.createdAt,
    };
}

function staffReport(
    report: IReport,
    reporterUsername?: string,
    reasonLabel?: string,
    subReasonLabel?: string,
): StaffReport {
    const snapshot = report.userProfileSnapshot;
    const snapshotIsActive =
        report.status === 'open' || report.status === 'reviewing';
    return {
        ...publicReport(report, reasonLabel, subReasonLabel),
        reportCount: report.reportCount,
        reasonLabel: reasonLabel ?? report.reasonLabel,
        reporterId: report.reporterId,
        reporterUsername,
        details: report.details,
        serverId: report.serverId,
        channelId: report.channelId,
        targetUsername: report.targetUsername,
        targetUserId:
            report.targetUserId ??
            (report.targetType === 'user' ? report.targetId : undefined),
        messageSnapshot: report.messageSnapshot,
        messageContent: report.messageContent,
        messageContext: report.messageContext,
        userProfileSnapshot: snapshot
            ? {
                  username: snapshot.username,
                  displayName: snapshot.displayName,
                  bio: snapshot.bio,
                  pronouns: snapshot.pronouns,
                  usernameFont: snapshot.usernameFont,
                  usernameGradient: snapshot.usernameGradient,
                  usernameGlow: snapshot.usernameGlow,
                  customStatus: snapshot.customStatus,
                  presenceStatus: snapshot.presenceStatus,
                  isBot: snapshot.isBot,
                  botVerified: snapshot.botVerified,
                  decorationId: snapshot.decorationId,
                  badges: snapshot.badges,
                  privacySettings: snapshot.privacySettings,
                  connections: snapshot.connections,
                  bannerColor: snapshot.bannerColor,
                  profilePrimaryColor: snapshot.profilePrimaryColor,
                  profileAccentColor: snapshot.profileAccentColor,
                  createdAt: snapshot.createdAt,
                  profilePictureAvailable:
                      snapshotIsActive &&
                      snapshot.profilePictureFile !== undefined,
                  bannerAvailable:
                      snapshotIsActive && snapshot.bannerFile !== undefined,
              }
            : undefined,
        internalNote: report.internalNote,
        reviewedBy: report.reviewedBy,
    };
}

function reportMessageSnapshot(
    message: IMessage,
    text = message.text,
    editHistory: ReportMessageEditSnapshot[] = [],
): ReportMessageSnapshot {
    return {
        text,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        deletedAt: message.deletedAt,
        isEdited: message.isEdited,
        editHistory,
        isWebhook: message.isWebhook,
        webhookUsername: message.webhookUsername,
        reply: message.referenced_message
            ? {
                  id: message.referenced_message.snowflakeId,
                  senderId: message.referenced_message.senderId,
                  text: message.referenced_message.text,
              }
            : undefined,
        attachments: message.attachments ?? [],
        embeds: message.embeds ?? [],
        components: message.components ?? [],
        poll: message.poll
            ? {
                  title: message.poll.title,
                  options: message.poll.options.map((option) => ({
                      id: option.id,
                      text: option.text,
                      emoji: option.emoji,
                      emojiType: option.emojiType,
                      emojiId: option.emojiId,
                      votes: option.votes.length,
                  })),
                  multiSelect: message.poll.multiSelect,
                  expiresAt: message.poll.expiresAt,
              }
            : undefined,
        stickerId: message.stickerId,
        interaction: message.interaction,
    };
}

function reportContextMessageSnapshot(
    message: IMessageWithEditHistory,
    senderUsername: string,
    isTarget: boolean,
): ReportContextMessageSnapshot {
    return {
        id: message.snowflakeId,
        senderId: message.senderId,
        senderUsername,
        isTarget,
        ...reportMessageSnapshot(message, message.text, message.editHistory),
    };
}
