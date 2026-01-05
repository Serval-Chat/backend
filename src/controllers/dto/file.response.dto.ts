import { ApiProperty } from '@nestjs/swagger';

export class FileUploadResponseDTO {
    @ApiProperty()
    url!: string;
}

export class FileMetadataResponseDTO {
    @ApiProperty()
    filename!: string;

    @ApiProperty()
    size!: number;

    @ApiProperty()
    isBinary!: boolean;

    @ApiProperty()
    mimeType!: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    modifiedAt!: Date;
}
