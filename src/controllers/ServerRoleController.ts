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
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import { PermissionService } from '@/permissions/PermissionService';
import { isPermissionKey } from '@/permissions/types';
import type { ILogger } from '@/di/interfaces/ILogger';

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
// Controller for managing server roles and their permissions
// Enforces 'manageRoles' permission checks and protects the mandatory '@everyone' role
@injectable()
@Controller('api/v1/servers/:serverId/roles')
@ApiTags('Server Roles')
@ApiBearerAuth()
export class ServerRoleController {
    constructor(
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
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
    ) {}

    // Retrieves all roles for a specific server
    // Enforces server membership
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
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.roleRepo.findByServerId(serverOid);
    }

    // Creates a new role in a server
    // Enforces 'manageRoles' permission and automatically calculates the next position
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
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        // New roles are placed at the top of the hierarchy by default
        const maxPositionRole =
            await this.roleRepo.findMaxPositionByServerId(serverOid);
        const position = maxPositionRole ? maxPositionRole.position + 1 : 1;

        if (body.name.trim().toLowerCase() === '@everyone') {
            throw new BadRequestException('Role name "@everyone" is reserved');
        }

        const roleColor =
            body.startColor ||
            body.endColor ||
            (body.colors && body.colors.length > 0)
                ? null
                : body.color || '#99aab5';

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
            startColor: body.startColor,
            endColor: body.endColor,
            colors: body.colors,
            gradientRepeat: body.gradientRepeat,
            separateFromOtherRoles: body.separateFromOtherRoles,
            position,
            permissions: filteredPermissions,
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

    // Reorders roles within a server's hierarchy
    // Enforces 'manageRoles' permission
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
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        // Bulk update role positions to reflect the new hierarchy
        const everyoneRole = await this.roleRepo.findEveryoneRole(serverOid);
        const everyoneId = everyoneRole?._id?.toString();

        const oldAllRoles = await this.roleRepo.findByServerId(serverOid);
        const roleMap = new Map(
            oldAllRoles.map((r) => [r._id.toString(), r.name]),
        );

        const oldOrderedNames = oldAllRoles
            .filter((r) => r._id.toString() !== everyoneId)
            .sort((a, b) => b.position - a.position)
            .map((r) => r.name);

        for (const { roleId, position } of body.rolePositions) {
            if (everyoneId && roleId === everyoneId) continue;
            await this.roleRepo.update(new Types.ObjectId(roleId), {
                position,
            });
        }
        this.permissionService.invalidateCache(serverOid);

        const filteredPositions = body.rolePositions.filter(
            (rp) => rp.roleId !== everyoneId,
        );

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

        return await this.roleRepo.findByServerId(serverOid);
    }

    // Updates an existing role's properties
    // Enforces 'manageRoles' permission
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
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (!role || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        const updates: Record<string, unknown> = {};
        if (body.name) {
            if (body.name.trim().toLowerCase() === '@everyone') {
                throw new BadRequestException(
                    'Role name "@everyone" is reserved',
                );
            }
            updates.name = body.name.trim();
        }

        // If gradient colors are provided, clear the solid color to indicate gradient mode
        if (
            body.startColor ||
            body.endColor ||
            (body.colors && body.colors.length > 0)
        ) {
            updates.color = null;
        } else if (body.color !== undefined) {
            updates.color = body.color;
        }

        if (body.startColor !== undefined) updates.startColor = body.startColor;
        if (body.endColor !== undefined) updates.endColor = body.endColor;
        if (body.colors !== undefined) updates.colors = body.colors;
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

        const updatedRole = await this.roleRepo.update(roleOid, updates);
        if (!updatedRole) {
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
        if (updates.name && updates.name !== role.name)
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
            updates.startColor !== undefined &&
            updates.startColor !== role.startColor
        )
            changes.push({
                field: 'startColor',
                before: role.startColor,
                after: updates.startColor,
            });
        if (
            updates.endColor !== undefined &&
            updates.endColor !== role.endColor
        )
            changes.push({
                field: 'endColor',
                before: role.endColor,
                after: updates.endColor,
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
            updates.permissions &&
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

    // Delete a role
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
        const hasPermission = await this.permissionService.hasPermission(
            serverOid,
            userOid,
            'manageRoles',
        );
        if (!hasPermission) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (!role || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (role.name === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE,
            );
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

    // Upload role icon
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
        @UploadedFile() icon: Express.Multer.File,
        @Req() req: ExpressRequest,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const roleOid = new Types.ObjectId(roleId);
        if (
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleOid);
        if (!role || !role.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (!icon) {
            throw new BadRequestException('No file uploaded');
        }

        // max 1MB for icon
        if (icon.size > 1024 * 1024) {
            fs.unlinkSync(icon.path);
            throw new BadRequestException('File size too large. Max 1MB.');
        }

        // Validate image
        try {
            const metadata = await getImageMetadata(icon.path);
            if (!metadata.width || !metadata.height) {
                throw new Error('Invalid image');
            }
        } catch {
            if (fs.existsSync(icon.path)) fs.unlinkSync(icon.path);
            throw new BadRequestException('Invalid image file');
        }

        const iconsDir = path.join(process.cwd(), 'uploads', 'role-icons');
        if (!fs.existsSync(iconsDir)) {
            fs.mkdirSync(iconsDir, { recursive: true });
        }

        // Remove old icon if exists
        if (role.icon) {
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
        if (!updatedRole) {
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

    // Serve role icon
    @Get('icon/:filename')
    @ApiOperation({ summary: 'Get role icon' })
    @ApiResponse({ status: 200, description: 'Role icon image' })
    @ApiResponse({ status: 404, description: 'Icon not found' })
    public async getRoleIcon(
        @Param('filename') filename: string,
        @Res() res: Response,
    ): Promise<void> {
        const filePath = path.join(
            process.cwd(),
            'uploads',
            'role-icons',
            filename,
        );

        if (!fs.existsSync(filePath)) {
            res.status(404).send({ error: 'Icon not found' });
            return;
        }

        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return new Promise<void>((resolve, _reject) => {
            res.sendFile(filePath, (err) => {
                if (err) {
                    if (!res.headersSent) {
                        res.status(500).send({ error: 'Failed to send icon' });
                    }
                }
                resolve();
            });
        });
    }
}
