import 'reflect-metadata';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { User } from '../../src/models/User';
import { MongooseAdminNoteRepository } from '../../src/infrastructure/repositories/MongooseAdminNoteRepository';

describe('MongooseAdminNoteRepository', () => {
    let mongod: MongoMemoryServer;
    let repo: MongooseAdminNoteRepository;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri());
        repo = new MongooseAdminNoteRepository();
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongod.stop();
    });

    it('resolves editorIdUser for a note edit, instead of silently dropping it', async () => {
        const creator = await User.create({
            username: 'creator',
            login: 'creator@example.com',
            password: 'hashed',
            displayName: 'Creator Cat',
        });
        const editor = await User.create({
            username: 'editor',
            login: 'editor@example.com',
            password: 'hashed',
            displayName: 'Editor Cat',
        });

        const note = await repo.create({
            targetId: 'target-1',
            targetType: 'User',
            adminId: creator.snowflakeId,
            content: 'original content',
        });

        const updated = await repo.update(
            note.snowflakeId,
            editor.snowflakeId,
            'edited content',
        );

        expect(updated).not.toBeNull();
        expect(updated?.history).toHaveLength(1);
        expect(updated?.history[0]?.editorId).toBe(creator.snowflakeId);
        expect(updated?.history[0]?.editorIdUser).toMatchObject({
            username: 'creator',
            displayName: 'Creator Cat',
        });

        expect(updated?.adminId).toBe(editor.snowflakeId);
        expect(updated?.adminIdUser).toMatchObject({
            username: 'editor',
            displayName: 'Editor Cat',
        });
    });

    it('resolves editorIdUser through findByTarget too, for every entry across multiple edits', async () => {
        const creator = await User.create({
            username: 'creator2',
            login: 'creator2@example.com',
            password: 'hashed',
            displayName: 'Creator Two',
        });
        const editor = await User.create({
            username: 'editor2',
            login: 'editor2@example.com',
            password: 'hashed',
            displayName: 'Editor Two',
        });

        const note = await repo.create({
            targetId: 'target-2',
            targetType: 'User',
            adminId: creator.snowflakeId,
            content: 'v1',
        });
        await repo.update(note.snowflakeId, editor.snowflakeId, 'v2');
        await repo.update(note.snowflakeId, creator.snowflakeId, 'v3');

        const [found] = await repo.findByTarget('target-2', 'User');

        expect(found?.history).toHaveLength(2);
        expect(found?.history[0]?.editorIdUser).toMatchObject({
            username: 'creator2',
        });
        expect(found?.history[1]?.editorIdUser).toMatchObject({
            username: 'editor2',
        });
    });
});
