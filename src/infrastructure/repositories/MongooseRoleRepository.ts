import { injectable } from 'inversify';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
    IRoleRepository,
    IRole,
    IRolePermissions,
} from '@/di/interfaces/IRoleRepository';
import { Role } from '@/models/Server';

// Mongoose Role repository
//
// Implements IRoleRepository using Mongoose Role model
@injectable()
@Injectable()
export class MongooseRoleRepository implements IRoleRepository {
    public async findById(id: Types.ObjectId): Promise<IRole | null> {
        return await Role.findById(id).lean();
    }

    public async findByServerId(serverId: Types.ObjectId): Promise<IRole[]> {
        return await Role.find({ serverId }).sort({ position: -1 }).lean();
    }

    // Create a new role
    //
    // Sets default color and empty permissions if not provided
    public async create(data: {
        serverId: Types.ObjectId;
        name: string;
        color?: string;
        startColor?: string;
        endColor?: string;
        colors?: string[];
        gradientRepeat?: number;
        separateFromOtherRoles?: boolean;
        position?: number;
        permissions?: Partial<IRolePermissions>;
        managed?: boolean;
        managedBotId?: Types.ObjectId;
        glowEnabled?: boolean;
    }): Promise<IRole> {
        const role = new Role({
            serverId: data.serverId,
            name: data.name,
            // Default color is a grey if none specified
            color: (data.color !== undefined && data.color !== '') ? data.color : '#99aab5',
            startColor: data.startColor,
            endColor: data.endColor,
            colors: data.colors,
            gradientRepeat: data.gradientRepeat,
            separateFromOtherRoles: data.separateFromOtherRoles,
            position: data.position ?? 0,
            permissions: data.permissions ?? {},
            managed: data.managed ?? false,
            managedBotId: data.managedBotId,
            glowEnabled: data.glowEnabled,
        });
        return await role.save();
    }

    public async update(
        id: Types.ObjectId,
        data: Partial<IRole>,
    ): Promise<IRole | null> {
        return await Role.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    public async delete(id: Types.ObjectId): Promise<boolean> {
        const result = await Role.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    public async findEveryoneRole(serverId: Types.ObjectId): Promise<IRole | null> {
        return await Role.findOne({ serverId, name: '@everyone' }).lean();
    }

    public async updatePosition(
        id: Types.ObjectId,
        position: number,
    ): Promise<IRole | null> {
        return await Role.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
    }

    public async deleteByServerId(serverId: Types.ObjectId): Promise<number> {
        const result = await Role.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async findByServerIdAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<IRole | null> {
        return await Role.findOne({ serverId, name }).lean();
    }

    public async findMaxPositionByServerId(
        serverId: Types.ObjectId,
    ): Promise<IRole | null> {
        return await Role.findOne({ serverId }).sort({ position: -1 }).lean();
    }
}
