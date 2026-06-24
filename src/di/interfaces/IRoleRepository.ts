import type { Types } from 'mongoose';
import type { PermissionKey } from '@/permissions/types';

// Role permissions structure
export type IRolePermissions = Record<PermissionKey, boolean>;

// Role interface (domain model)
//
// Defines a set of permissions and visual styles (color/gradient) for a group of users
export interface IRole {
    _id: Types.ObjectId;
    snowflakeId: string;
    serverId: string;
    name: string;
    // Solid color for the role (hex string)
    // If null, the role uses gradient mode (startColor/endColor/colors)
    color: string | null;
    // Gradient start color (hex string)
    startColor?: string;
    // Gradient end color (hex string)
    endColor?: string;
    // Multi-color gradient array for complex gradients
    colors?: string[];
    // Number of times to repeat the gradient (1 = no repeat, 2+ = repeat)
    gradientRepeat?: number;
    separateFromOtherRoles?: boolean;
    position: number;
    permissions: IRolePermissions;
    description?: string;
    icon?: string;
    managed: boolean;
    managedBotId?: string;
    glowEnabled: boolean;
    createdAt?: Date;
}

// Role Repository Interface
//
// Encapsulates role operations
export interface IRoleRepository {
    findById(id: string): Promise<IRole | null>;

    findByServerId(serverId: string): Promise<IRole[]>;

    create(data: {
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
        description?: string;
        icon?: string;
        managed?: boolean;
        managedBotId?: string;
        glowEnabled?: boolean;
    }): Promise<IRole>;

    update(id: string, data: Partial<IRole>): Promise<IRole | null>;

    delete(id: string): Promise<boolean>;

    findEveryoneRole(serverId: string): Promise<IRole | null>;

    // Find role by server ID and name
    findByServerIdAndName(
        serverId: string,
        name: string,
    ): Promise<IRole | null>;

    updatePosition(id: string, position: number): Promise<IRole | null>;

    deleteByServerId(serverId: string): Promise<number>;

    // Find role with maximum position for a server
    findMaxPositionByServerId(serverId: string): Promise<IRole | null>;
}
