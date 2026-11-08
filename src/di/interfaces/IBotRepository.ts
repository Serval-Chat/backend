import type { IBot } from '@/models/Bot';

export interface IBotRepository {
    findByUserId(userId: string): Promise<IBot | null>;
}
