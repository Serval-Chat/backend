import { injectable } from 'inversify';
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
export class MongooseRoleRepository implements IRoleRepository {
    async findById(id: string): Promise<IRole | null> {
        return await Role.findById(id).lean();
    }

    async findByServerId(serverId: string): Promise<IRole[]> {
        return await Role.find({ serverId }).sort({ position: -1 }).lean();
    }

    // Create a new role
    //
    // Sets default color and empty permissions if not provided
    async create(data: {
        serverId: string;
        name: string;
        color?: string;
        startColor?: string;
        endColor?: string;
        colors?: string[];
        gradientRepeat?: number;
        separateFromOtherRoles?: boolean;
        position?: number;
        permissions?: Partial<IRolePermissions>;
    }): Promise<IRole> {
        const role = new Role({
            serverId: data.serverId,
            name: data.name,
            // Default color is a grey if none specified
            color: data.color || '#99aab5',
            startColor: data.startColor,
            endColor: data.endColor,
            colors: data.colors,
            gradientRepeat: data.gradientRepeat,
            separateFromOtherRoles: data.separateFromOtherRoles,
            position: data.position || 0,
            permissions: data.permissions || {},
        });
        return await role.save();
    }

    async update(id: string, data: Partial<IRole>): Promise<IRole | null> {
        return await Role.findByIdAndUpdate(id, data, { new: true }).lean();
    }

    async delete(id: string): Promise<boolean> {
        const result = await Role.deleteOne({ _id: id });
        return result.deletedCount ? result.deletedCount > 0 : false;
    }

    async findEveryoneRole(serverId: string): Promise<IRole | null> {
        return await Role.findOne({ serverId, name: '@everyone' }).lean();
    }

    async updatePosition(id: string, position: number): Promise<IRole | null> {
        return await Role.findByIdAndUpdate(
            id,
            { position },
            { new: true },
        ).lean();
    }

    async deleteByServerId(serverId: string): Promise<number> {
        const result = await Role.deleteMany({ serverId });
        return result.deletedCount || 0;
    }

    async findByServerIdAndName(
        serverId: string,
        name: string,
    ): Promise<IRole | null> {
        return await Role.findOne({ serverId, name }).lean();
    }

    async findMaxPositionByServerId(serverId: string): Promise<IRole | null> {
        return await Role.findOne({ serverId }).sort({ position: -1 }).lean();
    }
}
