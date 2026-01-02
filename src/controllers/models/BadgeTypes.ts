// User badge display information.
export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    createdAt: Date;
}

// Payload for assigning badges to a user.
export interface AssignBadgesRequest {
    badgeIds: string[];
}

// Response for badge operations.
export interface BadgeOperationResponse {
    message: string;
    badges: Badge[];
}
