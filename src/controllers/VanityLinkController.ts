import {
    Controller,
    Get,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiOkResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import type { IInviteRepository } from '@/di/interfaces/IInviteRepository';
import type { IVanityLinkRepository } from '@/di/interfaces/IVanityLinkRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';

import { ErrorMessages } from '@/constants/errorMessages';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { AuthGuard } from '@/modules/auth/auth.module';
import { SetVanityLinkRequestDTO } from './dto/vanity-link.request.dto';
import {
    VanityLinkResponseDTO,
    VanityLinkDeletedResponseDTO,
} from './dto/vanity-link.response.dto';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
    );
}

@Controller('api/v1')
@ApiTags('Vanity Links')
export class VanityLinkController {
    public constructor(
        @Inject(TYPES.VanityLinkRepository)
        private vanityLinkRepo: IVanityLinkRepository,
        @Inject(TYPES.InviteRepository)
        private inviteRepo: IInviteRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.ServerDiscoveryService)
        private discoveryService: ServerDiscoveryService,
    ) {}

    @Get('servers/:serverId/vanity-link')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Get a server's vanity link" })
    @ApiOkResponse({
        type: VanityLinkResponseDTO,
        description: 'Vanity link retrieved',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.VANITY_LINK.NO_PERMISSION_MANAGE,
    })
    public async getVanityLink(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<VanityLinkResponseDTO> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageInvites',
            new ForbiddenException(
                ErrorMessages.VANITY_LINK.NO_PERMISSION_MANAGE,
            ),
        );

        const vanityLink = await this.vanityLinkRepo.findByServerId(serverId);
        if (vanityLink === null) {
            return { code: null };
        }

        const creator = await this.userRepo.findById(
            vanityLink.createdByUserId,
        );

        return {
            code: vanityLink.code,
            createdByUserId: vanityLink.createdByUserId,
            createdByUsername: creator?.username,
            createdAt: vanityLink.createdAt,
        };
    }

    @Put('servers/:serverId/vanity-link')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Set or replace a server's vanity link" })
    @ApiOkResponse({
        type: VanityLinkResponseDTO,
        description: 'Vanity link set',
    })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.VANITY_LINK.CODE_TAKEN,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.VANITY_LINK.ONLY_OWNER,
    })
    public async setVanityLink(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('username') username: string,
        @Body() body: SetVanityLinkRequestDTO,
    ): Promise<VanityLinkResponseDTO> {
        await this.ensureOwnerCanManageVanityLink(serverId, userId);
        await this.ensureCodeAvailable(serverId, body.code);

        let vanityLink;
        try {
            vanityLink = await this.vanityLinkRepo.setForServer(
                serverId,
                body.code,
                userId,
            );
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new BadRequestException(
                    ErrorMessages.VANITY_LINK.CODE_TAKEN,
                );
            }
            throw error;
        }

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'vanity_link_set',
            targetId: vanityLink.snowflakeId,
            targetType: 'server',
            metadata: {
                code: vanityLink.code,
            },
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_vanity_link_set',
            payload: {
                serverId,
                code: vanityLink.code,
                senderId: userId,
            },
        });

        await this.discoveryService.refreshServer(serverId);

        return {
            code: vanityLink.code,
            createdByUserId: vanityLink.createdByUserId,
            createdByUsername: username,
            createdAt: vanityLink.createdAt,
        };
    }

    @Delete('servers/:serverId/vanity-link')
    @UseGuards(AuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Delete a server's vanity link" })
    @ApiOkResponse({
        type: VanityLinkDeletedResponseDTO,
        description: 'Vanity link deleted',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.VANITY_LINK.ONLY_OWNER,
    })
    @ApiResponse({
        status: 404,
        description: ErrorMessages.VANITY_LINK.NOT_FOUND,
    })
    public async deleteVanityLink(
        @Param('serverId') serverId: string,
        @CurrentUser('id') userId: string,
    ): Promise<VanityLinkDeletedResponseDTO> {
        await this.ensureOwnerCanManageVanityLink(serverId, userId);

        const vanityLink = await this.vanityLinkRepo.findByServerId(serverId);
        if (vanityLink === null) {
            throw new NotFoundException(ErrorMessages.VANITY_LINK.NOT_FOUND);
        }

        await this.vanityLinkRepo.deleteByServerId(serverId);
        await this.discoveryService.refreshServer(serverId);

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverId,
            actorId: userId,
            actionType: 'vanity_link_delete',
            targetId: vanityLink.snowflakeId,
            targetType: 'server',
            metadata: {
                code: vanityLink.code,
            },
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'server_vanity_link_deleted',
            payload: {
                serverId,
                code: vanityLink.code,
                senderId: userId,
            },
        });

        return { message: 'Vanity link deleted' };
    }

    private async ensureOwnerCanManageVanityLink(
        serverId: string,
        userId: string,
    ): Promise<void> {
        await this.permissionService.requirePermission(
            serverId,
            userId,
            'manageInvites',
            new ForbiddenException(
                ErrorMessages.VANITY_LINK.NO_PERMISSION_MANAGE,
            ),
        );

        const server = await this.serverRepo.findById(serverId);
        if (server === null || String(server.ownerId) !== userId) {
            throw new ForbiddenException(ErrorMessages.VANITY_LINK.ONLY_OWNER);
        }
    }

    private async ensureCodeAvailable(
        serverId: string,
        code: string,
    ): Promise<void> {
        const existingVanity = await this.vanityLinkRepo.findByCode(code);
        if (existingVanity !== null && existingVanity.serverId !== serverId) {
            throw new BadRequestException(ErrorMessages.VANITY_LINK.CODE_TAKEN);
        }

        const existingInvite = await this.inviteRepo.findByCode(code);
        if (existingInvite !== null) {
            throw new BadRequestException(ErrorMessages.VANITY_LINK.CODE_TAKEN);
        }
    }
}
