import type { IBadge } from '@/models/Badge';

export type BadgeData = Pick<
    IBadge,
    'id' | 'name' | 'description' | 'icon' | 'color'
>;

export interface IBadgeRepository {
    findAll(): Promise<IBadge[]>;
    findByIdOrSnowflake(id: string): Promise<IBadge | null>;
    findByIdsOrSnowflakes(ids: string[]): Promise<IBadge[]>;
    create(data: BadgeData): Promise<IBadge>;
    update(
        id: string,
        changes: Partial<Omit<BadgeData, 'id'>>,
    ): Promise<IBadge | null>;
    deleteByIdOrSnowflake(id: string): Promise<void>;
}
