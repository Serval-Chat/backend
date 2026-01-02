export interface AdminBanHistoryItemDTO {
    _id: string;
    reason: string;
    timestamp: Date;
    expirationTimestamp: Date;
    issuedBy: string;
    active: boolean;
}

export type AdminUserBanHistoryResponseDTO = AdminBanHistoryItemDTO[];

export type AdminBanListResponseDTO = any[]; // Using any[] for now as the internal Ban model is complex

export interface AdminBansDiagnosticResponseDTO {
    appBans: {
        count: number;
        sample: any[];
    };
    serverBans: {
        count: number;
        sample: any[];
    };
}
