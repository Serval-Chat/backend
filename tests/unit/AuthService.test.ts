/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { AuthService } from '../../src/services/AuthService';
import { createTestUser, createTestBan } from '../utils/test-utils';

describe('AuthService', () => {
    let mockLogger: Record<string, jest.Mock>;
    let mockUserRepo: Record<string, jest.Mock>;
    let mockBanRepo: Record<string, jest.Mock>;
    let mockPasswordResetRepo: Record<string, jest.Mock>;
    let mockMailService: Record<string, jest.Mock>;
    let mockMetrics: Record<string, jest.Mock>;
    let mockAuditLogRepo: Record<string, jest.Mock>;
    let authService: AuthService;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };

        mockUserRepo = {
            findByLogin: jest.fn(),
            findByUsername: jest.fn(),
            comparePassword: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            updatePassword: jest.fn(),
            incrementTokenVersion: jest.fn()
        };

        mockBanRepo = {
            checkExpired: jest.fn().mockResolvedValue(true),
            findActiveByUserId: jest.fn().mockResolvedValue(null)
        };

        mockPasswordResetRepo = {
            createIfUnderLimit: jest.fn(),
            findByHashedToken: jest.fn(),
            markAsUsed: jest.fn(),
            deleteByUser: jest.fn()
        };

        mockMailService = {
            sendPasswordResetEmail: jest.fn(),
            sendPasswordChangedNotification: jest.fn()
        };

        mockMetrics = {
            increment: jest.fn()
        };

        mockAuditLogRepo = {
            create: jest.fn()
        };

        authService = new AuthService(
            mockLogger as any,
            mockUserRepo as any,
            mockBanRepo as any,
            mockPasswordResetRepo as any,
            mockMailService as any,
            mockMetrics as any,
            mockAuditLogRepo as any
        );
    });

    it('login with valid username credentials', async () => {
        const testUser = createTestUser({ username: 'validuser', login: 'validuser' });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);

        const result = await authService.login('validuser', 'correctpassword');

        expect(result.success).toBe(true);
        expect(result.user?._id).toBe(testUser._id);
        expect(result.user?.username).toBe('validuser');
        expect(result.error).toBeUndefined();
        
        expect(mockUserRepo.findByLogin).toHaveBeenCalledTimes(1);
        expect(mockUserRepo.comparePassword).toHaveBeenCalledTimes(1);
        expect(mockBanRepo.checkExpired).toHaveBeenCalledTimes(1);
    });

    it('login with valid email credentials', async () => {
        const testUser = createTestUser({
            username: 'testuser',
            login: 'testuser',
            email: 'test@example.com'
        });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);

        const result = await authService.login('test@example.com', 'password123');

        expect(result.success).toBe(true);
        expect(result.user?.email).toBe('test@example.com');
    });

    it('login with invalid password', async () => {
        const testUser = createTestUser();

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(false);

        const result = await authService.login('testuser', 'wrongpassword');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
        expect(result.user).toBeUndefined();
    });

    it('login with invalid password increments failed attempt counter', async () => {
        const testUser = createTestUser({ failedLoginAttempts: 2 });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(false);

        const result = await authService.login('testuser', 'wrongpassword');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
        expect(mockUserRepo.update).toHaveBeenCalledWith(testUser.snowflakeId, {
            failedLoginAttempts: 3,
            loginLockedUntil: null
        });
    });

    it('login locks account after too many failed attempts', async () => {
        const testUser = createTestUser({ failedLoginAttempts: 4 });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(false);

        const result = await authService.login('testuser', 'wrongpassword');

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            'Too many failed login attempts. This account is temporarily locked, try again later.'
        );
        expect(result.locked?.lockedUntil).toBeInstanceOf(Date);
        expect(mockUserRepo.update).toHaveBeenCalledWith(testUser.snowflakeId, {
            failedLoginAttempts: 0,
            loginLockedUntil: expect.any(Date)
        });
    });

    it('login rejects while account is locked out, without comparing password', async () => {
        const testUser = createTestUser({
            loginLockedUntil: new Date(Date.now() + 60_000)
        });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);

        const result = await authService.login('testuser', 'anypassword');

        expect(result.success).toBe(false);
        expect(result.locked).toBeDefined();
        expect(mockUserRepo.comparePassword).not.toHaveBeenCalled();
    });

    it('login clears failed attempt counter on success', async () => {
        const testUser = createTestUser({ failedLoginAttempts: 3 });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);

        const result = await authService.login('testuser', 'correctpassword');

        expect(result.success).toBe(true);
        expect(mockUserRepo.update).toHaveBeenCalledWith(testUser.snowflakeId, {
            failedLoginAttempts: 0,
            loginLockedUntil: null
        });
    });

    it('login with non-existent user', async () => {
        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(null);

        const result = await authService.login('nonexistent', 'password');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
        expect(mockUserRepo.findByLogin).toHaveBeenCalledTimes(1);
        expect(mockUserRepo.comparePassword).not.toHaveBeenCalled();
    });

    it('login with soft-deleted account', async () => {
        const deletedUser = createTestUser({
            deletedAt: new Date(),
            anonymizedUsername: 'deleted-user-12345'
        });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(deletedUser);

        const result = await authService.login('testuser', 'password');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid credentials');
        expect(mockUserRepo.comparePassword).not.toHaveBeenCalled();
    });

    it('login with banned account (permanent ban)', async () => {
        const testUser = createTestUser();
        const activeBan = createTestBan({
            userId: testUser.snowflakeId,
            reason: 'Violation of terms of service',
            active: true
        });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);
        (mockBanRepo.findActiveByUserId as jest.Mock).mockResolvedValue(activeBan);

        const result = await authService.login('testuser', 'password');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Your account has been banned');
        expect(result.ban?.reason).toBe('Violation of terms of service');
        expect(result.ban?.expirationTimestamp).toBeUndefined();
        
        expect(mockBanRepo.checkExpired).toHaveBeenCalledTimes(1);
        expect(mockBanRepo.findActiveByUserId).toHaveBeenCalledTimes(1);
    });

    it('login with banned account (temporary ban)', async () => {
        const testUser = createTestUser();
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); 
        const activeBan = createTestBan({
            userId: testUser.snowflakeId,
            reason: 'Spamming',
            active: true,
            expirationTimestamp: futureDate
        });

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);
        (mockBanRepo.findActiveByUserId as jest.Mock).mockResolvedValue(activeBan);

        const result = await authService.login('testuser', 'password');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Your account has been banned');
        expect(result.ban?.reason).toBe('Spamming');
        expect(result.ban?.expirationTimestamp?.getTime()).toBe(futureDate.getTime());
    });

    it('login calls ban expiration check', async () => {
        const testUser = createTestUser();

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);

        await authService.login('testuser', 'password');

        expect(mockBanRepo.checkExpired).toHaveBeenCalledTimes(1);
        expect(mockBanRepo.checkExpired).toHaveBeenCalledWith(testUser.snowflakeId);
    });

    it('login without active ban succeeds', async () => {
        const testUser = createTestUser();

        (mockUserRepo.findByLogin as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.comparePassword as jest.Mock).mockResolvedValue(true);
        (mockBanRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);

        const result = await authService.login('testuser', 'password');

        expect(result.success).toBe(true);
        expect(result.user?._id).toBe(testUser._id);
        expect(result.ban).toBeUndefined();
    });

    it('login calls repository methods in correct order', async () => {
        const callOrder: string[] = [];
        const testUser = createTestUser();

        (mockUserRepo.findByLogin as jest.Mock).mockImplementation(async () => {
            callOrder.push('findByLogin');
            return testUser;
        });

        (mockUserRepo.comparePassword as jest.Mock).mockImplementation(async () => {
            callOrder.push('comparePassword');
            return true;
        });

        (mockBanRepo.checkExpired as jest.Mock).mockImplementation(async () => {
            callOrder.push('checkExpired');
            return true;
        });

        (mockBanRepo.findActiveByUserId as jest.Mock).mockImplementation(async () => {
            callOrder.push('findActiveByUserId');
            return null;
        });

        await authService.login('testuser', 'password');

        expect(callOrder).toEqual([
            'findByLogin',
            'comparePassword',
            'checkExpired',
            'findActiveByUserId'
        ]);
    });
});

