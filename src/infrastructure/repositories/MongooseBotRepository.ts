import { injectable } from 'inversify';
import { Bot, type IBot } from '@/models/Bot';
import type { IBotRepository } from '@/di/interfaces/IBotRepository';

@injectable()
export class MongooseBotRepository implements IBotRepository {
    public async findByUserId(userId: string): Promise<IBot | null> {
        return await Bot.findOne({ userId }).lean();
    }
}
