import type { IExportJob } from '@/models/ExportJob';

export interface IExportJobRepository {
    findById(id: string): Promise<IExportJob | null>;
    findByChannelId(channelId: string): Promise<IExportJob | null>;
    findLatestByChannel(channelId: string): Promise<IExportJob | null>;
    findByDownloadToken(token: string): Promise<IExportJob | null>;
    findPendingJobs(): Promise<IExportJob[]>;
    findExpiredJobs(): Promise<IExportJob[]>;
    create(data: Partial<IExportJob>): Promise<IExportJob>;
    update(id: string, data: Partial<IExportJob>): Promise<IExportJob | null>;
    delete(id: string): Promise<boolean>;
    deleteByChannelId(channelId: string): Promise<number>;
}
