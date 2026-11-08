import type { IDecoration } from '@/models/Decoration';

export interface IDecorationRepository {
    create(data: {
        name: string;
        filename: string;
        createdBy: string;
    }): Promise<IDecoration>;
    findById(id: string): Promise<IDecoration | null>;
    findByCreator(userId: string): Promise<IDecoration[]>;
    delete(id: string): Promise<void>;
}
