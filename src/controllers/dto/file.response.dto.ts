import { ApiProperty } from '@nestjs/swagger';

export class FileUploadResponseDTO {
    @ApiProperty()
    public url!: string;
}

export class FileMetadataResponseDTO {
    @ApiProperty()
    public filename!: string;

    @ApiProperty()
    public size!: number;

    @ApiProperty()
    public isBinary!: boolean;

    @ApiProperty()
    public mimeType!: string;

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public modifiedAt!: Date;
}
