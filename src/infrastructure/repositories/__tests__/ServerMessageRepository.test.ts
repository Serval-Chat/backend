/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { MongooseServerMessageRepository } from '../MongooseServerMessageRepository';
import { ServerMessage } from '@/models/Server';

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
                user: { id: 'caller-user-id', username: 'caller' },
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
                    createdAt: new Date(),
                }),
            };

            const mockQuery = {
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(mockDbMessage),
            };
            (ServerMessage.findOne as jest.Mock) = jest
                .fn()
                .mockReturnValue(mockQuery);

            const result = await repository.findById(
                mockDbMessage._id.toString(),
            );

            expect(result).not.toBeNull();
            expect(result?.interaction).toBeDefined();
            expect(result?.interaction?.command).toBe('poke');
            expect(result?.interaction?.user.username).toBe('caller');
        });

        it('should preserve interaction metadata during transformation of populated documents', async () => {
            const mockInteraction = {
                command: 'poke',
                options: [],
                user: { id: 'u1', username: 'user1' },
            };

            const mockDoc = {
                _id: new Types.ObjectId(),
                text: 'Interaction Response',
                interaction: mockInteraction,
                repliedToMessageId: new Types.ObjectId(),
                createdAt: new Date(),
            } as any;

            const result = repository['transformMessage'](mockDoc);

            expect(result.interaction).toEqual(mockInteraction);
        });
    });

    describe('findByChannelId with `around`', () => {
        const makeFindChain = (result: unknown[]) => ({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            populate: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(result),
        });

        it('resolves the context target by snowflake id only', async () => {
            const snowflake = '0246233124965449728';
            const target = {
                _id: new Types.ObjectId(),
                snowflakeId: snowflake,
                createdAt: new Date('2024-06-01T00:00:00Z'),
            };
            const older = {
                _id: new Types.ObjectId(),
                snowflakeId: '0000000000000000000',
                createdAt: new Date('2024-05-31T00:00:00Z'),
            };

            (ServerMessage.findOne as jest.Mock) = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(target),
            });
            (ServerMessage.find as jest.Mock) = jest
                .fn()
                .mockReturnValueOnce(makeFindChain([older])) // before
                .mockReturnValueOnce(makeFindChain([target])); // after (>= target)

            const result = await repository.findByChannelId(
                'channel-1',
                100,
                undefined,
                snowflake,
            );

            const filterArg = (ServerMessage.findOne as jest.Mock).mock
                .calls[0][0];
            expect(filterArg.$or).toBeUndefined();
            expect(filterArg.snowflakeId).toBe(snowflake);
            expect(result).toHaveLength(2);
        });

        it('returns an empty window when the target snowflake is unknown', async () => {
            (ServerMessage.findOne as jest.Mock) = jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(null),
            });

            const result = await repository.findByChannelId(
                'channel-1',
                100,
                undefined,
                '0246233124965449728',
            );

            expect(result).toEqual([]);
        });
    });
});
