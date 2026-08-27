import type { Types } from 'mongoose';

// VanityLink interface (domain model)
export interface IVanityLink {
    _id: Types.ObjectId;
    snowflakeId: string;
    serverId: string;
    code: string;
    createdByUserId: string;
    createdAt: Date;
}

// VanityLink Repository Interface
export interface IVanityLinkRepository {
    // Find the vanity link for a server
    findByServerId(serverId: string): Promise<IVanityLink | null>;

    // Find a vanity link by its code
    findByCode(code: string): Promise<IVanityLink | null>;

    // Create or replace the server's vanity link
    setForServer(
        serverId: string,
        code: string,
        createdByUserId: string,
    ): Promise<IVanityLink>;

    // Delete the vanity link for a server. Returns true if one existed.
    deleteByServerId(serverId: string): Promise<boolean>;
}
