import type { Types } from 'mongoose';
import type { ISlashCommand, ISlashCommandOption } from '@/models/SlashCommand';

export interface ISlashCommandRepository {
    create(data: { botId: Types.ObjectId; name: string; description: string; options?: ISlashCommandOption[]; shouldReply?: boolean }): Promise<ISlashCommand>;
    update(id: Types.ObjectId, data: Partial<ISlashCommand>): Promise<ISlashCommand | null>;
    delete(id: Types.ObjectId): Promise<boolean>;
    findById(id: Types.ObjectId): Promise<ISlashCommand | null>;
    findByBotId(botId: Types.ObjectId): Promise<ISlashCommand[]>;
    findAll(): Promise<ISlashCommand[]>;
    deleteByBotId(botId: Types.ObjectId): Promise<number>;
    findByNameAndBotIds(name: string, botIds: Types.ObjectId[]): Promise<ISlashCommand | null>;
}
