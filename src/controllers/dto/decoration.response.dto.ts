import { ApiProperty } from '@nestjs/swagger';

export class DecorationResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public filename!: string;

    @ApiProperty()
    public createdBy!: string;

    @ApiProperty()
    public createdAt!: Date;
}

export class UploadDecorationResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: DecorationResponseDTO })
    public decoration!: DecorationResponseDTO;
}

export class SimpleMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class DecorationListResponseDTO {
    @ApiProperty({ type: [DecorationResponseDTO] })
    public decorations!: DecorationResponseDTO[];
}
