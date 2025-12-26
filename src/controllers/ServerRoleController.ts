import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Route,
    Body,
    Path,
    Security,
    Response,
    Tags,
    Request,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import type { IRoleRepository, IRole } from '../di/interfaces/IRoleRepository';
import type { IServerMemberRepository } from '../di/interfaces/IServerMemberRepository';
import { PermissionService } from '../services/PermissionService';
import type { ILogger } from '../di/interfaces/ILogger';
import { getIO } from '../socket';
import express from 'express';
import { ErrorResponse } from './models/ErrorResponse';
import { ErrorMessages } from '../constants/errorMessages';

export interface CreateRoleRequest {
    name: string;
    color?: string;
    startColor?: string;
    endColor?: string;
    colors?: string[];
    gradientRepeat?: number;
    separateFromOtherRoles?: boolean;
    permissions?: any;
}

export interface UpdateRoleRequest {
    name?: string;
    color?: string;
    startColor?: string;
    endColor?: string;
    colors?: string[];
    gradientRepeat?: number;
    separateFromOtherRoles?: boolean;
    permissions?: any;
    position?: number;
}

export interface ReorderRolesRequest {
    rolePositions: { roleId: string; position: number }[];
}

/**
 * Controller for managing server roles and their permissions.
 * Enforces security via 'manageRoles' permission checks and protects the mandatory '@everyone' role.
 */
@injectable()
@Route('api/v1/servers/{serverId}/roles')
@Tags('Server Roles')
@Security('jwt')
export class ServerRoleController extends Controller {
    constructor(
        @inject(TYPES.RoleRepository) private roleRepo: IRoleRepository,
        @inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {
        super();
    }

    /**
     * Retrieves all roles for a specific server.
     * Enforces server membership.
     */
    @Get()
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.SERVER.NOT_MEMBER,
    })
    public async getServerRoles(
        @Path() serverId: string,
        @Request() req: express.Request,
    ): Promise<IRole[]> {
        // @ts-ignore
        const userId = req.user.id;
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverId,
            userId,
        );
        if (!member) {
            this.setStatus(403);
            throw new Error(ErrorMessages.SERVER.NOT_MEMBER);
        }

        return await this.roleRepo.findByServerId(serverId);
    }

    /**
     * Creates a new role in a server.
     * Enforces 'manageRoles' permission and automatically calculates the next position.
     */
    @Post()
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async createRole(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: CreateRoleRequest,
    ): Promise<IRole> {
        // @ts-ignore
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
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
                : (body.color || '#99aab5');

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

        const io = getIO();
        io.to(`server:${serverId}`).emit('role_created', { serverId, role });

        return role;
    }

    /**
     * Reorders roles within a server's hierarchy.
     * Enforces 'manageRoles' permission.
     */
    @Patch('reorder')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    public async reorderRoles(
        @Path() serverId: string,
        @Request() req: express.Request,
        @Body() body: ReorderRolesRequest,
    ): Promise<{ message: string }> {
        // @ts-ignore
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
        }

        // Bulk update role positions to reflect the new hierarchy
        for (const { roleId, position } of body.rolePositions) {
            await this.roleRepo.update(roleId, { position });
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('roles_reordered', {
            serverId,
            rolePositions: body.rolePositions,
        });

        return { message: 'Roles reordered' };
    }

    /**
     * Updates an existing role's properties.
     * Enforces 'manageRoles' permission.
     */
    @Patch('{roleId}')
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @Response<ErrorResponse>('404', 'Role not found', {
        error: ErrorMessages.ROLE.NOT_FOUND,
    })
    public async updateRole(
        @Path() serverId: string,
        @Path() roleId: string,
        @Request() req: express.Request,
        @Body() body: UpdateRoleRequest,
    ): Promise<IRole> {
        // @ts-ignore
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.ROLE.NOT_FOUND);
        }

        const updates: any = {};
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
            this.setStatus(404);
            throw new Error(ErrorMessages.ROLE.NOT_FOUND);
        }

        const io = getIO();
        io.to(`server:${serverId}`).emit('role_updated', {
            serverId,
            role: updatedRole,
        });

        return updatedRole;
    }

    /**
     * Delete a role.
     */
    @Delete('{roleId}')
    @Response<ErrorResponse>('400', 'Bad Request', {
        error: ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE,
    })
    @Response<ErrorResponse>('403', 'Forbidden', {
        error: ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES,
    })
    @Response<ErrorResponse>('404', 'Role not found', {
        error: ErrorMessages.ROLE.NOT_FOUND,
    })
    public async deleteRole(
        @Path() serverId: string,
        @Path() roleId: string,
        @Request() req: express.Request,
    ): Promise<{ message: string }> {
        // @ts-ignore
        const userId = req.user.id;
        if (
            !(await this.permissionService.hasPermission(
                serverId,
                userId,
                'manageRoles',
            ))
        ) {
            this.setStatus(403);
            throw new Error(ErrorMessages.MEMBER.NO_PERMISSION_MANAGE_ROLES);
        }

        const role = await this.roleRepo.findById(roleId);
        if (!role || role.serverId.toString() !== serverId) {
            this.setStatus(404);
            throw new Error(ErrorMessages.ROLE.NOT_FOUND);
        }

        if (role.name === '@everyone') {
            this.setStatus(400);
            throw new Error(ErrorMessages.ROLE.CANNOT_DELETE_EVERYONE);
        }

        await this.roleRepo.delete(roleId);

        // Remove role from all members
        await this.serverMemberRepo.removeRoleFromAll(serverId, roleId);

        const io = getIO();
        io.to(`server:${serverId}`).emit('role_deleted', { serverId, roleId });

        return { message: 'Role deleted' };
    }

}
