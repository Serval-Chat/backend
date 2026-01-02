import type { Types } from 'mongoose';

// Invite interface (domain model)
//
// Represents a server invitation that can be used by new members to join
export interface IInvite {
    _id: any;
    serverId: Types.ObjectId | string;
    // Unique random code for the invite
    code: string;
    // Custom invite code
    customPath?: string;
    createdByUserId: Types.ObjectId | string;
    maxUses?: number;
    uses: number;
    expiresAt?: Date;
    createdAt: Date;
}

// Invite creation DTO
export interface CreateInviteDTO {
    serverId: string;
    code: string;
    customPath?: string;
    createdByUserId: string | Types.ObjectId;
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
    findById(id: string): Promise<IInvite | null>;

    // Find all invites for a server
    findByServerId(serverId: string): Promise<IInvite[]>;

    // Find invite by custom path
    findByCustomPath(customPath: string): Promise<IInvite | null>;

    // Find invite by code or custom path
    findByCodeOrCustomPath(codeOrPath: string): Promise<IInvite | null>;

    // Create a new invite
    create(data: CreateInviteDTO): Promise<IInvite>;

    // Increment uses count
    incrementUses(id: string): Promise<IInvite | null>;

    // Delete invite by ID
    delete(id: string): Promise<boolean>;

    // Delete all invites for a server (bulk delete)
    deleteByServerId(serverId: string): Promise<number>;
}
