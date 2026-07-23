import type { Types } from 'mongoose';

// Warning interface (domain model)
//
// Represents a formal warning issued to a user by an administrator
export interface IWarning {
    _id: Types.ObjectId;
    snowflakeId: string;
    userId: string;
    message: string;
    // The administrator who issued the warning
    // Can be an ID or a hydrated object with username
    issuedBy: string;
    acknowledged: boolean;
    acknowledgedAt?: Date;
    timestamp: Date;
    expiryDurationMinutes?: number;
    expiresAt?: Date;
}

// Warning Repository Interface
//
// Manages user warnings and acknowledgements
export interface IWarningRepository {
    // Find all warnings for a specific user
    findByUserId(userId: string, acknowledged?: boolean): Promise<IWarning[]>;

    // Find a warning by its ID
    findById(id: string): Promise<IWarning | null>;

    // Mark a warning as acknowledged by the user
    acknowledge(id: string): Promise<IWarning | null>;

    // Count warnings for a user
    countByUserId(userId: string): Promise<number>;

    // Whether the user has any unacknowledged warning
    hasUnacknowledged(userId: string): Promise<boolean>;

    // Create a new warning.
    create(data: {
        userId: string;
        message: string;
        issuedBy: string;
        expiryDurationMinutes?: number;
    }): Promise<IWarning>;

    // Delete all warnings for a user (for hard delete)
    deleteAllForUser(userId: string): Promise<{ deletedCount: number }>;

    // Find all warnings with pagination
    findAll(options: { limit?: number; offset?: number }): Promise<IWarning[]>;
}
