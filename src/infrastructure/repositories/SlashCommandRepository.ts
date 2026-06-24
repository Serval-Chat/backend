import { injectable } from 'inversify';
import { SlashCommand } from '@/models/SlashCommand';
import type { ISlashCommand, ISlashCommandOption } from '@/models/SlashCommand';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';

@injectable()
export class SlashCommandRepository implements ISlashCommandRepository {
    public async create(data: {
        botId: string;
        name: string;
        description: string;
        options?: ISlashCommandOption[];
        shouldReply?: boolean;
    }): Promise<ISlashCommand> {
        return SlashCommand.create(data);
    }

    public async update(
        id: string,
        data: Partial<ISlashCommand>,
    ): Promise<ISlashCommand | null> {
        return SlashCommand.findOneAndUpdate({ snowflakeId: id }, data, {
            new: true,
        }).exec();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await SlashCommand.deleteOne({
            snowflakeId: id,
        }).exec();
        return result.deletedCount > 0;
    }

    public async findById(id: string): Promise<ISlashCommand | null> {
        return SlashCommand.findOne({ snowflakeId: id }).exec();
    }

    public async findByBotId(botId: string): Promise<ISlashCommand[]> {
        return SlashCommand.find({ botId }).exec();
    }

    public async findAll(): Promise<ISlashCommand[]> {
        return SlashCommand.find().exec();
    }

    public async deleteByBotId(botId: string): Promise<number> {
        const result = await SlashCommand.deleteMany({ botId }).exec();
        return result.deletedCount;
    }

    public async findByNameAndBotIds(
        name: string,
        botIds: string[],
    ): Promise<ISlashCommand | null> {
        return SlashCommand.findOne({
            botId: { $in: botIds },
            name: name.toLowerCase(),
        }).exec();
    }
}
