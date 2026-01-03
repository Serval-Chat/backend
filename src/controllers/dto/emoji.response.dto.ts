export interface EmojiResponseDTO {
    _id: string;
    name: string;
    imageUrl: string;
    serverId: string;
    createdBy: string;
    createdAt?: Date;
}
