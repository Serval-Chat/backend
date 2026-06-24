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
    public async findById(id: string): Promise<IRole | null> {
        return await Role.findOne({ snowflakeId: id }).lean();
    }

    public async findByServerId(serverId: string): Promise<IRole[]> {
        return await Role.find({ serverId }).sort({ position: -1 }).lean();
    }

    // Create a new role
    //
    // Sets default color and empty permissions if not provided
    public async create(data: {
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
        managed?: boolean;
        managedBotId?: string;
        glowEnabled?: boolean;
    }): Promise<IRole> {
        const role = new Role({
            serverId: data.serverId,
            name: data.name,
            // Default color is a grey if none specified
            color:
                data.color !== undefined && data.color !== ''
                    ? data.color
                    : '#99aab5',
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
        id: string,
        data: Partial<IRole>,
    ): Promise<IRole | null> {
        return await Role.findOneAndUpdate({ snowflakeId: id }, data, {
            new: true,
        }).lean();
    }

    public async delete(id: string): Promise<boolean> {
        const result = await Role.deleteOne({ snowflakeId: id });
        return result.deletedCount > 0;
    }

    public async findEveryoneRole(serverId: string): Promise<IRole | null> {
        return await Role.findOne({ serverId, name: '@everyone' }).lean();
    }

    public async updatePosition(
        id: string,
        position: number,
    ): Promise<IRole | null> {
        return await Role.findOneAndUpdate(
            { snowflakeId: id },
            { position },
            { new: true },
        ).lean();
    }

    public async deleteByServerId(serverId: string): Promise<number> {
        const result = await Role.deleteMany({ serverId });
        return result.deletedCount;
    }

    public async findByServerIdAndName(
        serverId: string,
        name: string,
    ): Promise<IRole | null> {
        return await Role.findOne({ serverId, name }).lean();
    }

    public async findMaxPositionByServerId(
        serverId: string,
    ): Promise<IRole | null> {
        return await Role.findOne({ serverId }).sort({ position: -1 }).lean();
    }
}
