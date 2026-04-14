import type { Types } from 'mongoose';
import type { IAdminNote } from '@/models/AdminNote';

export interface IAdminNoteRepository {
    create(data: {
        targetId: Types.ObjectId;
        targetType: 'User' | 'Server';
        adminId: Types.ObjectId;
        content: string;
    }): Promise<IAdminNote>;

    findById(id: Types.ObjectId): Promise<IAdminNote | null>;

    findByTarget(
        targetId: Types.ObjectId,
        targetType: 'User' | 'Server',
    ): Promise<IAdminNote[]>;

    update(
        id: Types.ObjectId,
        adminId: Types.ObjectId,
        content: string,
    ): Promise<IAdminNote | null>;

    softDelete(data: {
        id: Types.ObjectId;
        deletedBy: Types.ObjectId;
        deleteReason: string;
    }): Promise<IAdminNote | null>;
}
