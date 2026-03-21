import type { Types } from 'mongoose';
import { ExportJob, type IExportJob } from '@/models/ExportJob';
import type { IExportJobRepository } from '@/di/interfaces/IExportJobRepository';
import { injectable } from 'inversify';
import { Injectable } from '@nestjs/common';

@injectable()
@Injectable()
export class MongooseExportJobRepository implements IExportJobRepository {
    async findById(id: Types.ObjectId): Promise<IExportJob | null> {
        return await ExportJob.findById(id);
    }

    async findByChannelId(
        channelId: Types.ObjectId,
    ): Promise<IExportJob | null> {
        return await ExportJob.findOne({ channelId });
    }

    async findLatestByChannel(
        channelId: Types.ObjectId,
    ): Promise<IExportJob | null> {
        return await ExportJob.findOne({ channelId }).sort({ createdAt: -1 });
    }

    async findByDownloadToken(token: string): Promise<IExportJob | null> {
        return await ExportJob.findOne({ downloadToken: token });
    }

    async findPendingJobs(): Promise<IExportJob[]> {
        return await ExportJob.find({
            status: { $in: ['queued', 'failed'] },
            attempts: { $lt: 5 },
            nextAttemptAt: { $lte: new Date() },
        }).sort({ nextAttemptAt: 1 });
    }

    async findExpiredJobs(): Promise<IExportJob[]> {
        return await ExportJob.find({
            status: 'completed',
            expiresAt: { $lte: new Date() },
        });
    }

    async create(data: Partial<IExportJob>): Promise<IExportJob> {
        return await ExportJob.create(data);
    }

    async update(
        id: Types.ObjectId,
        data: Partial<IExportJob>,
    ): Promise<IExportJob | null> {
        return await ExportJob.findByIdAndUpdate(id, data, { new: true });
    }

    async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await ExportJob.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async deleteByChannelId(channelId: Types.ObjectId): Promise<number> {
        const result = await ExportJob.deleteMany({ channelId });
        return result.deletedCount;
    }
}
