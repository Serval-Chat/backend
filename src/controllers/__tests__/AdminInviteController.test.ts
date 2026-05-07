import { NotFoundException } from '@nestjs/common';
import { AdminInviteController } from '../AdminInviteController';
import type { RegistrationInviteService } from '@/services/RegistrationInviteService';
import type { Response } from 'express';

describe('AdminInviteController', () => {
    let controller: AdminInviteController;
    const mockInviteService = {
        listTokens: jest.fn(),
        createToken: jest.fn(),
        deleteToken: jest.fn(),
        batchCreateTokens: jest.fn(),
        getTokensFilePath: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AdminInviteController(
            mockInviteService as unknown as RegistrationInviteService,
        );
    });

    describe('listInvites', () => {
        it('returns list of tokens from service', () => {
            mockInviteService.listTokens.mockReturnValue(['t1', 't2']);
            const result = controller.listInvites();
            expect(result).toEqual(['t1', 't2']);
            expect(mockInviteService.listTokens).toHaveBeenCalled();
        });
    });

    describe('createInvite', () => {
        it('creates a token and returns it', () => {
            mockInviteService.createToken.mockReturnValue('new-token');
            const result = controller.createInvite();
            expect(result.token).toBe('new-token');
            expect(mockInviteService.createToken).toHaveBeenCalled();
        });
    });

    describe('deleteInvite', () => {
        it('throws NotFoundException if service returns false', () => {
            mockInviteService.deleteToken.mockReturnValue(false);
            expect(() => controller.deleteInvite('missing')).toThrow(
                NotFoundException,
            );
        });

        it('returns success message if service returns true', () => {
            mockInviteService.deleteToken.mockReturnValue(true);
            const result = controller.deleteInvite('valid');
            expect(result.message).toContain('deleted');
        });
    });

    describe('batchCreateInvites', () => {
        it('creates multiple tokens', () => {
            mockInviteService.batchCreateTokens.mockReturnValue(['t1', 't2']);
            const result = controller.batchCreateInvites({ count: 2 });
            expect(result.tokens).toEqual(['t1', 't2']);
            expect(result.message).toContain('2 invites');
        });
    });

    describe('exportInvites', () => {
        it('calls res.download with file path', () => {
            const res = { download: jest.fn() };
            mockInviteService.getTokensFilePath.mockReturnValue(
                '/path/to/tokens.txt',
            );
            controller.exportInvites(res as unknown as Response);
            expect(res.download).toHaveBeenCalledWith(
                '/path/to/tokens.txt',
                'invites.txt',
            );
        });
    });
});
