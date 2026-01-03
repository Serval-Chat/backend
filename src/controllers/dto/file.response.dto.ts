export interface FileUploadResponseDTO {
    url: string;
}

export interface FileMetadataResponseDTO {
    filename: string;
    size: number;
    isBinary: boolean;
    mimeType: string;
    createdAt: Date;
    modifiedAt: Date;
}
