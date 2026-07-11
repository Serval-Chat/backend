import { injectable } from 'inversify';
import { AdminNote, type IAdminNote } from '@/models/AdminNote';
import { User } from '@/models/User';
import type { IAdminNoteRepository } from '@/di/interfaces/IAdminNoteRepository';

const USER_REF_SELECT = 'snowflakeId username displayName profilePicture';

@injectable()
export class MongooseAdminNoteRepository implements IAdminNoteRepository {
    // history[] subdocuments and string editorIds prevent a normal populate(),
    // so editorIds are batch-resolved directly.
    private async attachEditorRefs(notes: IAdminNote[]): Promise<IAdminNote[]> {
        const editorIds = [
            ...new Set(notes.flatMap((n) => n.history.map((h) => h.editorId))),
        ];
        if (editorIds.length === 0) return notes;

        const users = await User.find({ snowflakeId: { $in: editorIds } })
            .select(USER_REF_SELECT)
            .lean();
        const userBySnowflakeId = new Map(users.map((u) => [u.snowflakeId, u]));

        return notes.map((note) => {
            const plain = (
                typeof (note as { toObject?: unknown }).toObject === 'function'
                    ? note.toObject({ virtuals: true })
                    : note
            ) as IAdminNote;
            plain.history = plain.history.map((h) => ({
                ...h,
                editorIdUser: userBySnowflakeId.get(h.editorId),
            }));
            return plain;
        });
    }

    public async create(data: {
        targetId: string;
        targetType: 'User' | 'Server';
        adminId: string;
        content: string;
    }): Promise<IAdminNote> {
        const note = new AdminNote(data);
        return await note.save();
    }

    public async findById(id: string): Promise<IAdminNote | null> {
        const note = await AdminNote.findOne({ snowflakeId: id })
            .populate('adminIdUser', USER_REF_SELECT)
            .populate('deletedByUser', USER_REF_SELECT)
            .exec();
        if (note === null) return null;
        const [resolved] = await this.attachEditorRefs([note]);
        return resolved ?? note;
    }

    public async findByTarget(
        targetId: string,
        targetType: 'User' | 'Server',
    ): Promise<IAdminNote[]> {
        const notes = await AdminNote.find({ targetId, targetType })
            .sort({ createdAt: -1 })
            .populate('adminIdUser', USER_REF_SELECT)
            .populate('deletedByUser', USER_REF_SELECT)
            .exec();
        return await this.attachEditorRefs(notes);
    }

    public async update(
        id: string,
        adminId: string,
        content: string,
    ): Promise<IAdminNote | null> {
        const currentNote = await AdminNote.findOne({
            snowflakeId: id,
            deletedAt: { $exists: false },
        });

        if (!currentNote) return null;

        currentNote.history.push({
            content: currentNote.content,
            editorId: currentNote.adminId,
            editedAt: currentNote.updatedAt,
        });

        currentNote.content = content;
        currentNote.adminId = adminId;

        const saved = await currentNote
            .save()
            .then((doc) =>
                doc.populate([
                    { path: 'adminIdUser', select: USER_REF_SELECT },
                ]),
            );

        const [resolved] = await this.attachEditorRefs([saved]);
        return resolved ?? saved;
    }

    public async softDelete(data: {
        id: string;
        deletedBy: string;
        deleteReason: string;
    }): Promise<IAdminNote | null> {
        const note = await AdminNote.findOneAndUpdate(
            { snowflakeId: data.id },
            {
                deletedAt: new Date(),
                deletedBy: data.deletedBy,
                deleteReason: data.deleteReason,
            },
            { new: true },
        )
            .populate('adminIdUser', USER_REF_SELECT)
            .populate('deletedByUser', USER_REF_SELECT)
            .exec();
        if (note === null) return null;
        const [resolved] = await this.attachEditorRefs([note]);
        return resolved ?? note;
    }
}
