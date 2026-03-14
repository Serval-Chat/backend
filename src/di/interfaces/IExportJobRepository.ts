import type { Types } from 'mongoose';
import type { IExportJob, ExportStatus } from '@/models/ExportJob';

export interface IExportJobRepository {
    findById(id: Types.ObjectId): Promise<IExportJob | null>;
    findByChannelId(channelId: Types.ObjectId): Promise<IExportJob | null>;
    findLatestByChannel(channelId: Types.ObjectId): Promise<IExportJob | null>;
    findByDownloadToken(token: string): Promise<IExportJob | null>;
    findPendingJobs(): Promise<IExportJob[]>;
    findExpiredJobs(): Promise<IExportJob[]>;
    create(data: Partial<IExportJob>): Promise<IExportJob>;
    update(id: Types.ObjectId, data: Partial<IExportJob>): Promise<IExportJob | null>;
    delete(id: Types.ObjectId): Promise<boolean>;
    deleteByChannelId(channelId: Types.ObjectId): Promise<number>;
}
