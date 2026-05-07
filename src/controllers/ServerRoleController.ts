import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Inject,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    UseInterceptors,
    UploadedFile,
    Res,
    HttpCode,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
import type { IRoleRepository, IRole } from '@/di/interfaces/IRoleRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import { PermissionService } from '@/permissions/PermissionService';
import { isPermissionKey } from '@/permissions/types';
import type { ILogger } from '@/di/interfaces/ILogger';
import { ImageDeliveryService } from '@/services/ImageDeliveryService';

import type { Request as ExpressRequest } from 'express';
import { ErrorMessages } from '@/constants/errorMessages';
import { JWTPayload } from '@/utils/jwt';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import {
    CreateRoleRequestDTO,
    UpdateRoleRequestDTO,
    ReorderRolesRequestDTO,
} from './dto/server-role.request.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { storage } from '@/config/multer';
import {
    processAndSaveImage,
    ImagePresets,
    getImageMetadata,
} from '@/utils/imageProcessing';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { ApiError } from '@/utils/ApiError';
@injectable()
@Controller('api/v1/servers/:serverId/roles')
@ApiTags('Server Roles')
@ApiBearerAuth()
export class ServerRoleController {
    public constructor(
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.AuditLogRepository)
        private auditLogRepo: IAuditLogRepository,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
        @Inject(TYPES.ImageDeliveryService)
        private imageDeliveryService: ImageDeliveryService,
    ) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get server roles' })
    @ApiResponse({ status: 200, description: 'Roles retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    public async getServerRoles(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<IRole[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.roleRepo.findByServerId(serverOid);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a role' })
    @ApiResponse({ status: 201, description: 'Role created' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async createRole(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: CreateRoleRequestDTO,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        // New roles are placed at the top of the hierarchy by default
        const maxPositionRole =
            await this.roleRepo.findMaxPositionByServerId(serverOid);
        const position =
            maxPositionRole !== null ? maxPositionRole.position + 1 : 1;

        if (body.name.trim().toLowerCase() === '@everyone') {
            throw new BadRequestException('Role name "@everyone" is reserved');
        }

        const roleColor =
            (body.startColor !== undefined && body.startColor !== '') ||
            (body.endColor !== undefined && body.endColor !== '') ||
            (body.colors !== undefined && body.colors.length > 0)
                ? null
                : (body.color ?? '#99aab5');

        const colors =
            body.colors !== undefined && body.colors.length > 0
                ? body.colors
                : body.startColor !== undefined && body.endColor !== undefined
                  ? [body.startColor, body.endColor]
                  : undefined;

        const filteredPermissions: Record<string, boolean> = {};
        if (body.permissions) {
            for (const key in body.permissions) {
                if (isPermissionKey(key)) {
                    filteredPermissions[key] = body.permissions[key] as boolean;
                }
            }
        }

        const role = await this.roleRepo.create({
            serverId: serverOid,
            name: body.name.trim(),
            color: roleColor as string,
            colors,
            gradientRepeat: body.gradientRepeat,
            separateFromOtherRoles: body.separateFromOtherRoles,
            position,
            permissions: filteredPermissions,
            glowEnabled:
                body.glowEnabled !== undefined ? body.glowEnabled : true,
        });
        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_created',
            payload: { serverId, role, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'role_create',
            targetId: role._id as Types.ObjectId,
            targetType: 'role',
            metadata: { roleName: role.name },
        });

        return role;
    }

    @Patch('reorder')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Reorder roles' })
    @ApiResponse({ status: 200, description: 'Roles reordered' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async reorderRoles(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: ReorderRolesRequestDTO,
    ): Promise<IRole[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner = server !== null && server.ownerId.equals(userOid);

        if (!isOwner) {
            const currentUserHighest =
                await this.permissionService.getHighestRolePosition(
                    serverOid,
                    userOid,
                );
            for (const { roleId, position } of body.rolePositions) {
                const r = await this.roleRepo.findById(
                    new Types.ObjectId(roleId),
                );
                if (r && currentUserHighest <= r.position) {
                    throw new ForbiddenException(
                        'You cannot move a role equal to or higher than your own highest role',
                    );
                }
                if (currentUserHighest <= position) {
                    throw new ForbiddenException(
                        'You cannot move a role to a position equal to or higher than your own highest role',
                    );
                }
            }
        }

        // Bulk update role positions to reflect the new hierarchy
        const everyoneRole = await this.roleRepo.findEveryoneRole(serverOid);
        const everyoneId =
            everyoneRole !== null ? everyoneRole._id.toString() : undefined;

        const oldAllRoles = await this.roleRepo.findByServerId(serverOid);
        const roleMap = new Map(
            oldAllRoles.map((r) => [r._id.toString(), r.name]),
        );

        const oldOrderedNames = oldAllRoles
            .filter((r) => r._id.toString() !== everyoneId)
            .sort((a, b) => b.position - a.position)
            .map((r) => r.name);

        for (const { roleId, position } of body.rolePositions) {
            if (
                everyoneId !== undefined &&
                everyoneId !== '' &&
                roleId === everyoneId
            )
                continue;
            await this.roleRepo.update(new Types.ObjectId(roleId), {
                position,
            });
        }
        this.permissionService.invalidateCache(serverOid);

        const filteredPositions = body.rolePositions.filter(
            (rp) => rp.roleId !== everyoneId,
        );

        if (filteredPositions.length > 0) {
            this.wsServer.broadcastToServer(serverId, {
                type: 'roles_reordered',
                payload: {
                    serverId,
                    rolePositions: filteredPositions,
                    senderId: userId,
                },
            });

            const orderedNames = [...body.rolePositions]
                .filter(({ roleId }) => roleId !== everyoneId)
                .sort((a, b) => b.position - a.position)
                .map(({ roleId }) => roleMap.get(roleId) ?? 'Unknown');

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'roles_reordered',
                targetId: serverOid,
                targetType: 'server',
                metadata: {
                    roleOrder: orderedNames,
                    oldRoleOrder: oldOrderedNames,
                },
            });
        }

        return await this.roleRepo.findByServerId(serverOid);
    }

    @Patch(':roleId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a role' })
    @ApiResponse({ status: 200, description: 'Role updated' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.ROLE.NOT_FOUND })
    public async updateRole(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
        @Body() body: UpdateRoleRequestDTO,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (role === null || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner = server !== null && server.ownerId.equals(userOid);

        if (!isOwner) {
            const currentUserHighest =
                await this.permissionService.getHighestRolePosition(
                    serverOid,
                    userOid,
                );
            if (currentUserHighest <= role.position) {
                throw new ForbiddenException(
                    'You cannot modify a role equal to or higher than your own highest role',
                );
            }
        }

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined && body.name !== '') {
            const newName = body.name.trim();
            if (newName !== role.name) {
                if (newName.toLowerCase() === '@everyone') {
                    throw new BadRequestException(
                        'Role name "@everyone" is reserved',
                    );
                }
                if (role.name === '@everyone') {
                    throw new BadRequestException(
                        'Cannot rename the @everyone role',
                    );
                }
                updates.name = newName;
            }
        }

        // If gradient colors are provided, clear the solid color to indicate gradient mode
        if (
            (body.startColor !== undefined && body.startColor !== '') ||
            (body.endColor !== undefined && body.endColor !== '') ||
            (body.colors !== undefined && body.colors.length > 0)
        ) {
            updates.color = null;
        } else if (body.color !== undefined) {
            updates.color = body.color;
        }

        if (body.colors !== undefined) {
            updates.colors = body.colors;
        } else if (
            body.startColor !== undefined ||
            body.endColor !== undefined
        ) {
            const s =
                body.startColor !== undefined
                    ? body.startColor
                    : role.startColor;
            const e =
                body.endColor !== undefined ? body.endColor : role.endColor;
            if (s !== undefined && s !== '' && e !== undefined && e !== '') {
                updates.colors = [s, e];
            }
        }

        updates.startColor = undefined;
        updates.endColor = undefined;

        if (body.gradientRepeat !== undefined)
            updates.gradientRepeat = body.gradientRepeat;
        if (body.separateFromOtherRoles !== undefined)
            updates.separateFromOtherRoles = body.separateFromOtherRoles;

        if (body.permissions) {
            const filteredPermissions: Record<string, boolean> = {};
            for (const key in body.permissions) {
                if (isPermissionKey(key)) {
                    filteredPermissions[key] = body.permissions[key] as boolean;
                }
            }
            updates.permissions = filteredPermissions;
        }

        if (body.position !== undefined) updates.position = body.position;
        if (body.glowEnabled !== undefined)
            updates.glowEnabled = body.glowEnabled;

        const updatedRole = await this.roleRepo.update(roleOid, updates);
        if (updatedRole === null) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_updated',
            payload: {
                serverId,
                role: updatedRole,
                senderId: userId,
            },
        });

        const changes = [];
        if (
            updates.name !== undefined &&
            updates.name !== '' &&
            updates.name !== role.name
        )
            changes.push({
                field: 'name',
                before: role.name,
                after: updates.name,
            });

        if (updates.color !== undefined && updates.color !== role.color)
            changes.push({
                field: 'color',
                before: role.color,
                after: updates.color,
            });

        if (
            updates.colors !== undefined &&
            JSON.stringify(updates.colors) !== JSON.stringify(role.colors)
        ) {
            changes.push({
                field: 'colors',
                before: role.colors,
                after: updates.colors,
            });
        }

        if (
            updates.gradientRepeat !== undefined &&
            updates.gradientRepeat !== role.gradientRepeat
        )
            changes.push({
                field: 'gradientRepeat',
                before: role.gradientRepeat,
                after: updates.gradientRepeat,
            });

        if (
            updates.permissions !== undefined &&
            JSON.stringify(updates.permissions) !==
                JSON.stringify(role.permissions)
        )
            changes.push({
                field: 'permissions',
                before: role.permissions,
                after: updates.permissions,
            });
        if (
            updates.position !== undefined &&
            updates.position !== role.position
        )
            changes.push({
                field: 'position',
                before: role.position,
                after: updates.position,
            });

        if (changes.length > 0) {
            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'role_update',
                targetId: roleOid,
                targetType: 'role',
                changes,
                metadata: { roleName: role.name },
            });
        }

        return updatedRole;
    }

    @Delete(':roleId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a role' })
    @ApiResponse({ status: 200, description: 'Role deleted' })
    @ApiResponse({
        status: 400,
        description: ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE,
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.ROLE.NOT_FOUND })
    public async deleteRole(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        const hasPermission =
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            )) === true;
        if (hasPermission === false) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (role === null || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        const server = await this.serverRepo.findById(serverOid);
        const isOwner = server !== null && server.ownerId.equals(userOid);

        if (!isOwner) {
            const currentUserHighest =
                await this.permissionService.getHighestRolePosition(
                    serverOid,
                    userOid,
                );
            if (currentUserHighest <= role.position) {
                throw new ForbiddenException(
                    'You cannot delete a role equal to or higher than your own highest role',
                );
            }
        }

        if (role.name === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE,
            );
        }

        if (role.managed) {
            throw new ForbiddenException('Cannot delete a managed role');
        }

        await this.roleRepo.delete(roleOid);

        this.permissionService.invalidateCache(serverOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_deleted',
            payload: { serverId, roleId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'role_delete',
            targetId: roleOid,
            targetType: 'role',
            metadata: { roleName: role.name },
        });

        return { message: 'Role deleted' };
    }

    @Post(':roleId/icon')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @UseInterceptors(FileInterceptor('icon', { storage }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                icon: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @HttpCode(200)
    @ApiOperation({ summary: 'Upload role icon' })
    @ApiResponse({ status: 200, description: 'Role icon uploaded' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async uploadRoleIcon(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @UploadedFile() icon: Express.Multer.File | undefined,
        @Req() req: ExpressRequest,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        if (
            (await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            )) !== true
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (role === null || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (icon === undefined) {
            throw new BadRequestException('No file uploaded');
        }

        // max 1MB for icon
        if (icon.size > 1024 * 1024) {
            if (icon.path !== '') fs.unlinkSync(icon.path);
            throw new BadRequestException('File size too large. Max 1MB.');
        }

        // Validate image
        try {
            const metadata = await getImageMetadata(icon.path);
            if (!metadata.width || !metadata.height) {
                throw new Error('Invalid image');
            }
        } catch {
            if (icon.path !== '' && fs.existsSync(icon.path) === true)
                fs.unlinkSync(icon.path);
            throw new BadRequestException('Invalid image file');
        }

        const iconsDir = path.join(process.cwd(), 'uploads', 'role-icons');
        if (fs.existsSync(iconsDir) === false) {
            fs.mkdirSync(iconsDir, { recursive: true });
        }

        // Remove old icon if exists
        if (role.icon !== undefined && role.icon !== '') {
            const oldPath = path.join(iconsDir, role.icon);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const filename = `${randomBytes(16).toString('hex')}.webp`;
        const targetPath = path.join(iconsDir, filename);

        try {
            await processAndSaveImage(
                icon.path,
                targetPath,
                ImagePresets.roleIcon(),
            );

            // Delete temp upload
            if (fs.existsSync(icon.path)) {
                fs.unlinkSync(icon.path);
            }
        } catch (err) {
            if (fs.existsSync(icon.path)) fs.unlinkSync(icon.path);
            this.logger.error('Failed to process role icon', err);
            throw new ApiError(500, 'Failed to process role icon');
        }

        const updatedRole = await this.roleRepo.update(roleOid, {
            icon: filename,
        });
        if (updatedRole === null) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_updated',
            payload: {
                serverId,
                role: updatedRole,
                senderId: userId,
            },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'role_icon_updated',
            targetId: roleOid,
            targetType: 'role',
            metadata: { roleName: role.name },
        });

        return updatedRole;
    }

    @Get('icon/:filename')
    @ApiOperation({ summary: 'Get role icon' })
    @ApiResponse({ status: 200, description: 'Role icon image' })
    @ApiResponse({ status: 404, description: 'Icon not found' })
    public async getRoleIcon(
        @Param('filename') filename: string,
        @Req() req: ExpressRequest,
        @Res() res: Response,
    ): Promise<void> {
        const filePath = path.join(
            process.cwd(),
            'uploads',
            'role-icons',
            filename,
        );

        if (fs.existsSync(filePath) === false) {
            res.status(404).send({ error: 'Icon not found' });
            return;
        }

        const { buffer, contentType, contentLength } =
            await this.imageDeliveryService.getProcessedImage(
                filePath,
                req.headers.accept,
            );

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', contentLength);
        res.setHeader('Cache-Control', 'public, max-age=86400');

        res.send(buffer);
    }
}
