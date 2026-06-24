import type { ISlashCommand, ISlashCommandOption } from '@/models/SlashCommand';

export interface ISlashCommandRepository {
    create(data: {
        botId: string;
        name: string;
        description: string;
        options?: ISlashCommandOption[];
        shouldReply?: boolean;
    }): Promise<ISlashCommand>;
    update(
        id: string,
        data: Partial<ISlashCommand>,
    ): Promise<ISlashCommand | null>;
    delete(id: string): Promise<boolean>;
    findById(id: string): Promise<ISlashCommand | null>;
    findByBotId(botId: string): Promise<ISlashCommand[]>;
    findAll(): Promise<ISlashCommand[]>;
    deleteByBotId(botId: string): Promise<number>;
    findByNameAndBotIds(
        name: string,
        botIds: string[],
    ): Promise<ISlashCommand | null>;
}
