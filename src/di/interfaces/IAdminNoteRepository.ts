import type { IAdminNote } from '@/models/AdminNote';

export interface IAdminNoteRepository {
    create(data: {
        targetId: string;
        targetType: 'User' | 'Server';
        adminId: string;
        content: string;
    }): Promise<IAdminNote>;

    findById(id: string): Promise<IAdminNote | null>;

    findByTarget(
        targetId: string,
        targetType: 'User' | 'Server',
    ): Promise<IAdminNote[]>;

    update(
        id: string,
        adminId: string,
        content: string,
    ): Promise<IAdminNote | null>;

    softDelete(data: {
        id: string;
        deletedBy: string;
        deleteReason: string;
    }): Promise<IAdminNote | null>;
}
