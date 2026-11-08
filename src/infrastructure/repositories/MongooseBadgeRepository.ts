import { injectable } from 'inversify';
import { Badge, type IBadge } from '@/models/Badge';
import type {
    BadgeData,
    IBadgeRepository,
} from '@/di/interfaces/IBadgeRepository';

const byIdOrSnowflake = (id: string) => ({
    $or: [{ id }, { snowflakeId: id }],
});

@injectable()
export class MongooseBadgeRepository implements IBadgeRepository {
    public async findAll(): Promise<IBadge[]> {
        return await Badge.find().sort({ createdAt: 1 }).lean();
    }

    public async findByIdOrSnowflake(id: string): Promise<IBadge | null> {
        return await Badge.findOne(byIdOrSnowflake(id)).lean();
    }

    public async findByIdsOrSnowflakes(ids: string[]): Promise<IBadge[]> {
        return await Badge.find({
            $or: [{ id: { $in: ids } }, { snowflakeId: { $in: ids } }],
        }).lean();
    }

    public async create(data: BadgeData): Promise<IBadge> {
        const badge = await new Badge(data).save();
        return badge.toObject();
    }

    public async update(
        id: string,
        changes: Partial<Omit<BadgeData, 'id'>>,
    ): Promise<IBadge | null> {
        const badge = await Badge.findOne(byIdOrSnowflake(id));
        if (badge === null) return null;

        if (changes.name !== undefined) badge.name = changes.name;
        if (changes.description !== undefined)
            badge.description = changes.description;
        if (changes.icon !== undefined) badge.icon = changes.icon;
        if (changes.color !== undefined) badge.color = changes.color;

        await badge.save();
        return badge.toObject();
    }

    public async deleteByIdOrSnowflake(id: string): Promise<void> {
        await Badge.deleteOne(byIdOrSnowflake(id));
    }
}
