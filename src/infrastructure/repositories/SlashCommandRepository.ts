import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import type { Types } from 'mongoose';
import { SlashCommand } from '@/models/SlashCommand';
import type { ISlashCommand, ISlashCommandOption } from '@/models/SlashCommand';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';

@injectable()
@Injectable()
export class SlashCommandRepository implements ISlashCommandRepository {
    public async create(data: { botId: Types.ObjectId; name: string; description: string; options?: ISlashCommandOption[]; shouldReply?: boolean }): Promise<ISlashCommand> {
        return SlashCommand.create(data);
    }

    public async update(id: Types.ObjectId, data: Partial<ISlashCommand>): Promise<ISlashCommand | null> {
        return SlashCommand.findByIdAndUpdate(id, data, { new: true }).exec();
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await SlashCommand.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    public async findById(id: Types.ObjectId): Promise<ISlashCommand | null> {
        return SlashCommand.findById(id).exec();
    }

    public async findByBotId(botId: Types.ObjectId): Promise<ISlashCommand[]> {
        return SlashCommand.find({ botId }).exec();
    }

    public async findAll(): Promise<ISlashCommand[]> {
        return SlashCommand.find().exec();
    }

    public async deleteByBotId(botId: Types.ObjectId): Promise<number> {
        const result = await SlashCommand.deleteMany({ botId }).exec();
        return result.deletedCount;
    }

    public async findByNameAndBotIds(name: string, botIds: Types.ObjectId[]): Promise<ISlashCommand | null> {
        return SlashCommand.findOne({ botId: { $in: botIds }, name: name.toLowerCase() }).exec();
    }
}
