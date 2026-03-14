import { type WsEvent } from '../event';
import { type Types } from 'mongoose';

export interface IExportCompletedEvent extends WsEvent<'export_completed', {
    channelId: Types.ObjectId | string;
    jobId: Types.ObjectId | string;
}> {}
