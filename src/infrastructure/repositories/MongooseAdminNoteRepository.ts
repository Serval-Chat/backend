import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import type { Types } from 'mongoose';
import { AdminNote, type IAdminNote } from '@/models/AdminNote';
import type { IAdminNoteRepository } from '@/di/interfaces/IAdminNoteRepository';

@injectable()
@Injectable()
export class MongooseAdminNoteRepository implements IAdminNoteRepository {
    async create(data: {
        targetId: Types.ObjectId;
        targetType: 'User' | 'Server';
        adminId: Types.ObjectId;
        content: string;
    }): Promise<IAdminNote> {
        const note = new AdminNote(data);
        return await note.save();
    }

    async findById(id: Types.ObjectId): Promise<IAdminNote | null> {
        return await AdminNote.findById(id)
            .populate('adminId', 'username displayName profilePicture')
            .populate('deletedBy', 'username displayName profilePicture')
            .populate('history.editorId', 'username displayName profilePicture')
            .exec();
    }

    async findByTarget(
        targetId: Types.ObjectId,
        targetType: 'User' | 'Server',
    ): Promise<IAdminNote[]> {
        return await AdminNote.find({ targetId, targetType })
            .sort({ createdAt: -1 })
            .populate('adminId', 'username displayName profilePicture')
            .populate('deletedBy', 'username displayName profilePicture')
            .populate('history.editorId', 'username displayName profilePicture')
            .exec();
    }

    async update(
        id: Types.ObjectId,
        adminId: Types.ObjectId,
        content: string,
    ): Promise<IAdminNote | null> {
        const currentNote = await AdminNote.findOne({
            _id: id,
            deletedAt: { $exists: false },
        });

        if (!currentNote) return null;

        // Archive current state to history
        currentNote.history.push({
            content: currentNote.content,
            editorId: currentNote.adminId, // Previous author/editor
            editedAt: currentNote.updatedAt || currentNote.createdAt,
        });

        // Update with new content and set new primary adminId (last editor)
        currentNote.content = content;
        currentNote.adminId = adminId;

        return await currentNote
            .save()
            .then((doc) =>
                doc.populate([
                    { path: 'adminId', select: 'username displayName profilePicture' },
                    { path: 'history.editorId', select: 'username displayName profilePicture' },
                ]),
            );
    }

    async softDelete(data: {
        id: Types.ObjectId;
        deletedBy: Types.ObjectId;
        deleteReason: string;
    }): Promise<IAdminNote | null> {
        return await AdminNote.findByIdAndUpdate(
            data.id,
            {
                deletedAt: new Date(),
                deletedBy: data.deletedBy,
                deleteReason: data.deleteReason,
            },
            { new: true },
        )
            .populate('adminId', 'username displayName profilePicture')
            .populate('deletedBy', 'username displayName profilePicture')
            .populate('history.editorId', 'username displayName profilePicture')
            .exec();
    }
}
