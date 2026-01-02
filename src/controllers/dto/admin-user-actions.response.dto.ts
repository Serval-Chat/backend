export interface AdminResetProfileResponseDTO {
    message: string;
    fields: string[];
}

export interface AdminSoftDeleteUserResponseDTO {
    message: string;
    anonymizedUsername: string;
    offlineFriends: number;
}

export interface AdminDeleteUserResponseDTO {
    message: string;
    anonymizedUsername: string;
}

export interface AdminHardDeleteUserResponseDTO {
    message: string;
    sentMessagesAnonymized: number;
    receivedMessagesAnonymized: number;
    offlineFriends: number;
}

export interface AdminUpdateUserPermissionsResponseDTO {
    message: string;
}

export interface AdminBanUserResponseDTO {
    _id: string;
    userId: string;
    reason: string;
    issuedBy: string;
    expirationTimestamp: Date;
    active: boolean;
    history?: any[];
}

export interface AdminUnbanUserResponseDTO {
    message: string;
}

export interface AdminWarnUserResponseDTO {
    _id: string;
    userId: string;
    issuedBy: string;
    message: string;
    timestamp: Date;
}
