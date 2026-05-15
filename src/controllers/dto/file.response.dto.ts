import { ApiProperty } from '@nestjs/swagger';
import type { IMessageAttachment } from '@/models/Attachment';

export class FileUploadResponseDTO {
    @ApiProperty()
    public url!: string;

    @ApiProperty()
    public attachment!: IMessageAttachment;
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
