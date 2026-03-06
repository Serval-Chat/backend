import type { Types } from 'mongoose';

// Warning interface (domain model)
//
// Represents a formal warning issued to a user by an administrator
export interface IWarning {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    message: string;
    // The administrator who issued the warning
    // Can be an ID or a hydrated object with username
    issuedBy: Types.ObjectId | { username: string };
    acknowledged: boolean;
    acknowledgedAt?: Date;
    timestamp: Date;
}

// Warning Repository Interface
//
// Manages user warnings and acknowledgements
export interface IWarningRepository {
    // Find all warnings for a specific user
    findByUserId(
        userId: Types.ObjectId,
        acknowledged?: boolean,
    ): Promise<IWarning[]>;

    // Find a warning by its ID
    findById(id: Types.ObjectId): Promise<IWarning | null>;

    // Mark a warning as acknowledged by the user
    acknowledge(id: Types.ObjectId): Promise<IWarning | null>;

    // Count warnings for a user
    countByUserId(userId: Types.ObjectId): Promise<number>;

    // Create a new warning
    create(data: {
        userId: Types.ObjectId;
        message: string;
        issuedBy: Types.ObjectId;
    }): Promise<IWarning>;

    // Delete all warnings for a user (for hard delete)
    deleteAllForUser(userId: Types.ObjectId): Promise<{ deletedCount: number }>;

    // Find all warnings with pagination
    findAll(options: { limit?: number; offset?: number }): Promise<IWarning[]>;
}
