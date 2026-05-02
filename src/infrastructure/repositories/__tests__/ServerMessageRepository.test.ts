import { Types } from 'mongoose';
import { MongooseServerMessageRepository } from '../MongooseServerMessageRepository';
import { ServerMessage } from '@/models/Server';
import type { IServerMessage } from '@/di/interfaces/IServerMessageRepository';

jest.mock('@/models/Server', () => ({
    ServerMessage: {
        findById: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
    },
}));


jest.mock('@/models/Reaction', () => ({
    Reaction: {
        aggregate: jest.fn(),
    },
}));

describe('MongooseServerMessageRepository', () => {
    let repository: MongooseServerMessageRepository;


    beforeEach(() => {
        jest.clearAllMocks();
        repository = new MongooseServerMessageRepository();
        const { Reaction } = require('@/models/Reaction');
        Reaction.aggregate.mockResolvedValue([]);
    });

    describe('Persistence and Transformation', () => {
        it('should correctly include and transform the interaction field', async () => {
            const mockInteraction = {
                command: 'poke',
                options: [{ name: 'user', value: 'target-user-id' }],
                user: { id: 'caller-user-id', username: 'caller' }
            };

            const mockDbMessage = {
                _id: new Types.ObjectId(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                senderId: new Types.ObjectId(),
                text: 'Pokes target-user-id!',
                interaction: mockInteraction,
                createdAt: new Date(),
                toObject: jest.fn().mockReturnValue({
                    _id: new Types.ObjectId(),
                    serverId: new Types.ObjectId(),
                    channelId: new Types.ObjectId(),
                    senderId: new Types.ObjectId(),
                    text: 'Pokes target-user-id!',
                    interaction: mockInteraction,
                    createdAt: new Date()
                })
            };

            const mockQuery = {
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(mockDbMessage)
            };
            (ServerMessage.findOne as jest.Mock) = jest.fn().mockReturnValue(mockQuery);

            const result = await repository.findById(mockDbMessage._id);

            expect(result).not.toBeNull();
            expect(result?.interaction).toBeDefined();
            expect(result?.interaction?.command).toBe('poke');
            expect(result?.interaction?.user.username).toBe('caller');
        });

        it('should preserve interaction metadata during transformation of populated documents', async () => {
            const mockInteraction = {
                command: 'poke',
                options: [],
                user: { id: 'u1', username: 'user1' }
            };

            const mockDoc = {
                _id: new Types.ObjectId(),
                text: 'Interaction Response',
                interaction: mockInteraction,
                repliedToMessageId: new Types.ObjectId(),
                createdAt: new Date()
            } as unknown as IServerMessage;

            const result = repository['transformMessage'](mockDoc);

            expect(result.interaction).toEqual(mockInteraction);
        });
    });
});
