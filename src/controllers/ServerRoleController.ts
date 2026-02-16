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
import { injectable, inject } from 'inversify';
import type { IRoleRepository, IRole } from '@/di/interfaces/IRoleRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
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
        @inject(TYPES.RoleRepository)
        @Inject(TYPES.RoleRepository)
        private roleRepo: IRoleRepository,
        @inject(TYPES.ServerMemberRepository)
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.PermissionService)
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger)
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @inject(TYPES.WsServer)
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
    ) {}

    // Retrieves all roles for a specific server
    // Enforces server membership
    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get server roles' })
    @ApiResponse({ status: 200, description: 'Roles retrieved' })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @UseGuards(JwtAuthGuard)
    public async getServerRoles(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<IRole[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.roleRepo.findByServerId(serverId);
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
    @UseGuards(JwtAuthGuard)
    public async createRole(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: CreateRoleRequestDTO,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        // New roles are placed at the top of the hierarchy by default
        const maxPositionRole =
            await this.roleRepo.findMaxPositionByServerId(serverId);
        const position = maxPositionRole ? maxPositionRole.position + 1 : 1;

        const roleColor =
            body.startColor ||
            body.endColor ||
            (body.colors && body.colors.length > 0)
                ? null
                : body.color || '#99aab5';

        const role = await this.roleRepo.create({
            serverId,
            name: body.name.trim(),
            color: roleColor as string,
            startColor: body.startColor,
            endColor: body.endColor,
            colors: body.colors,
            gradientRepeat: body.gradientRepeat,
            separateFromOtherRoles: body.separateFromOtherRoles,
            position,
            permissions: body.permissions || {},
        });

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_created',
            payload: { serverId, role },
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
    @UseGuards(JwtAuthGuard)
    public async reorderRoles(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @Body() body: ReorderRolesRequestDTO,
    ): Promise<IRole[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        // Bulk update role positions to reflect the new hierarchy
        for (const { roleId, position } of body.rolePositions) {
            await this.roleRepo.update(roleId, { position });
        }

        this.wsServer.broadcastToServer(serverId, {
            type: 'roles_reordered',
            payload: {
                serverId,
                rolePositions: body.rolePositions,
            },
        });

        return await this.roleRepo.findByServerId(serverId);
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
    @UseGuards(JwtAuthGuard)
    public async updateRole(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
        @Body() body: UpdateRoleRequestDTO,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        const updates: Record<string, unknown> = {};
        if (body.name) updates.name = body.name.trim();

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
        if (body.permissions) updates.permissions = body.permissions;
        if (body.position !== undefined) updates.position = body.position;

        const updatedRole = await this.roleRepo.update(roleId, updates);
        if (!updatedRole) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        this.permissionService.invalidateCache(serverId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_updated',
            payload: {
                serverId,
                role: updatedRole,
            },
        });

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
    @UseGuards(JwtAuthGuard)
    public async deleteRole(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @Req() req: ExpressRequest,
    ): Promise<{ message: string }> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const hasPermission = await this.permissionService.hasPermission(
            serverId,
            userId,
            'manageRoles',
        );
        if (!hasPermission) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            throw new NotFoundException(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (role.name === '@everyone') {
            throw new BadRequestException(
                ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE,
            );
        }

        await this.roleRepo.delete(roleId);

        this.permissionService.invalidateCache(serverId);

        this.wsServer.broadcastToServer(serverId, {
            type: 'role_deleted',
            payload: { serverId, roleId },
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
    @UseGuards(JwtAuthGuard)
    public async uploadRoleIcon(
        @Param('serverId') serverId: string,
        @Param('roleId') roleId: string,
        @UploadedFile() icon: Express.Multer.File,
        @Req() req: ExpressRequest,
    ): Promise<IRole> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
            );
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
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

        const updatedRole = await this.roleRepo.update(roleId, {
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
            },
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
