export interface AdminServerListItemDTO {
    _id: string;
    name: string;
    icon: string | null;
    banner?: {
        type: 'color' | 'image' | 'gif' | 'gradient';
        value: string;
    };
    ownerId: string;
    memberCount: number;
    createdAt: Date;
    deletedAt?: Date;
    owner: {
        _id: string;
        username: string;
        displayName: string | null;
        profilePicture: string | null;
    } | null;
}

export type AdminServerListResponseDTO = AdminServerListItemDTO[];

export interface AdminDeleteServerResponseDTO {
    message: string;
}

export interface AdminRestoreServerResponseDTO {
    message: string;
}
