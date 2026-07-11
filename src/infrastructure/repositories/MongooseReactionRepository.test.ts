import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';

import { Reaction } from '@/models/Reaction';
import { Emoji } from '@/models/Emoji';
import { ErrorMessages } from '@/constants/errorMessages';

import { MongooseReactionRepository } from './MongooseReactionRepository';

let mongod: MongoMemoryServer;
let repo: MongooseReactionRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseReactionRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Reaction.deleteMany({});
    await Emoji.deleteMany({});
});

describe('MongooseReactionRepository.addReaction', () => {
    const messageId = () => new Types.ObjectId().toHexString();
    const userId = () => new Types.ObjectId().toHexString();

    test('rejects a custom reaction whose emojiId does not match any existing emoji', async () => {
        const msgId = messageId();
        const nonExistentEmojiId = new Types.ObjectId().toHexString();

        await expect(
            repo.addReaction(
                msgId,
                'dm',
                userId(),
                'party_blob',
                'custom',
                nonExistentEmojiId,
            ),
        ).rejects.toThrow(ErrorMessages.REACTION.CUSTOM_NOT_FOUND);

        expect(await Reaction.findOne({ messageId: msgId })).toBeNull();
    });

    test('rejects a unicode reaction whose "emoji" is just raw text, not an actual emoji character', async () => {
        const msgId = messageId();

        await expect(
            repo.addReaction(msgId, 'dm', userId(), 'not an emoji', 'unicode'),
        ).rejects.toThrow();

        expect(await Reaction.findOne({ messageId: msgId })).toBeNull();
    });
});
