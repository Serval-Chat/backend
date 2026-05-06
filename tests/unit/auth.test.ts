import { expressAuthentication } from '../../src/auth';
import { User } from '../../src/models/User';
import { Ban } from '../../src/models/Ban';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../src/config/env';
import { createMockRequest, createTestUser } from '../utils/test-utils';
import { Types } from 'mongoose';

jest.mock('../../src/models/User');
jest.mock('../../src/models/Ban');
jest.mock('jsonwebtoken');

describe('expressAuthentication', () => {
    const mockToken = 'mock.jwt.token';
    const mockId = new Types.ObjectId().toString();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should authenticate user with undefined tokenVersion in DB and 0 in token', async () => {
        const decoded = { id: mockId, tokenVersion: 0 };
        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        const testUser = createTestUser({ _id: new Types.ObjectId(mockId), tokenVersion: undefined });
        
        const mockQuery = {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(testUser)
        };
        (User.findById as jest.Mock).mockReturnValue(mockQuery);
        (Ban.checkExpired as jest.Mock).mockResolvedValue(undefined);
        (Ban.findOne as jest.Mock).mockResolvedValue(null);

        const req = createMockRequest({
            headers: { authorization: `Bearer ${mockToken}` }
        });

        const result = await expressAuthentication(req, 'jwt');

        expect(result).toEqual(decoded);
        expect(User.findById).toHaveBeenCalledWith(mockId);
    });

    it('should reject if tokenVersion mismatch', async () => {
        const decoded = { id: mockId, tokenVersion: 0 };
        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        const testUser = createTestUser({ _id: new Types.ObjectId(mockId), tokenVersion: 1 });
        
        const mockQuery = {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(testUser)
        };
        (User.findById as jest.Mock).mockReturnValue(mockQuery);

        const req = createMockRequest({
            headers: { authorization: `Bearer ${mockToken}` }
        });

        await expect(expressAuthentication(req, 'jwt')).rejects.toThrow('Token expired');
    });

    it('should reject if user not found', async () => {
        const decoded = { id: mockId, tokenVersion: 0 };
        (jwt.verify as jest.Mock).mockReturnValue(decoded);

        const mockQuery = {
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(null)
        };
        (User.findById as jest.Mock).mockReturnValue(mockQuery);

        const req = createMockRequest({
            headers: { authorization: `Bearer ${mockToken}` }
        });

        await expect(expressAuthentication(req, 'jwt')).rejects.toThrow('Invalid token');
    });
});
