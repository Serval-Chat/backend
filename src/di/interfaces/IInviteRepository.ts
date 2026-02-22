import type { Types } from 'mongoose';

// Invite interface (domain model)
//
// Represents a server invitation that can be used by new members to join
export interface IInvite {
    _id: Types.ObjectId;
    serverId: Types.ObjectId;
    // Unique random code for the invite
    code: string;
    // Custom invite code
    customPath?: string;
    createdByUserId: Types.ObjectId;
    maxUses?: number;
    uses: number;
    expiresAt?: Date;
    createdAt: Date;
}

// Invite creation DTO
export interface CreateInviteDTO {
    serverId: Types.ObjectId;
    code: string;
    customPath?: string;
    createdByUserId: Types.ObjectId;
    maxUses?: number;
    expiresAt?: Date;
}

// Invite Repository Interface
//
// Encapsulates invite operations
export interface IInviteRepository {
    // Find invite by code
    findByCode(code: string): Promise<IInvite | null>;

    // Find invite by ID
    findById(id: Types.ObjectId): Promise<IInvite | null>;

    // Find all invites for a server
    findByServerId(serverId: Types.ObjectId): Promise<IInvite[]>;

    // Find invite by custom path
    findByCustomPath(customPath: string): Promise<IInvite | null>;

    // Find invite by code or custom path
    findByCodeOrCustomPath(codeOrPath: string): Promise<IInvite | null>;

    // Create a new invite
    create(data: CreateInviteDTO): Promise<IInvite>;

    // Increment uses count
    incrementUses(id: Types.ObjectId): Promise<IInvite | null>;

    // Delete invite by ID
    delete(id: Types.ObjectId): Promise<boolean>;

    // Delete all invites for a server (bulk delete)
    deleteByServerId(serverId: Types.ObjectId): Promise<number>;
}
