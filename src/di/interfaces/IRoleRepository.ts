import type { Types } from 'mongoose';

// Role permissions structure
export interface IRolePermissions {
    sendMessages: boolean;
    manageMessages: boolean;
    deleteMessagesOfOthers: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    banMembers: boolean;
    kickMembers: boolean;
    manageInvites: boolean;
    manageServer: boolean;
    administrator: boolean;
    manageWebhooks: boolean;
    pingRolesAndEveryone: boolean; // Permission to ping @everyone and roles
    addReactions: boolean;
    manageReactions: boolean;
    viewChannels: boolean;
}

// Role interface (domain model)
//
// Defines a set of permissions and visual styles (color/gradient) for a group of users
export interface IRole {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
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
    icon?: string;
    createdAt?: Date;
}

// Role Repository Interface
//
// Encapsulates role operations
export interface IRoleRepository {
    // Find role by ID
    findById(id: Types.ObjectId): Promise<IRole | null>;

    // Find all roles for a server
    findByServerId(serverId: Types.ObjectId): Promise<IRole[]>;

    // Create a new role
    create(data: {
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
        icon?: string;
    }): Promise<IRole>;

    // Update role
    update(id: Types.ObjectId, data: Partial<IRole>): Promise<IRole | null>;

    // Delete role by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Find @everyone role for a server
    findEveryoneRole(serverId: Types.ObjectId): Promise<IRole | null>;

    // Find role by server ID and name
    findByServerIdAndName(
        serverId: Types.ObjectId,
        name: string,
    ): Promise<IRole | null>;

    // Update role position
    updatePosition(id: Types.ObjectId, position: number): Promise<IRole | null>;

    // Delete all roles for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId): Promise<number>;

    // Find role with maximum position for a server
    findMaxPositionByServerId(serverId: Types.ObjectId): Promise<IRole | null>;
}
