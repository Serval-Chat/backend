import { ApiProperty } from '@nestjs/swagger';

export class GifTagResponseDTO {
    @ApiProperty({ example: '0327554478565752832' })
    public id!: string;

    @ApiProperty({ example: 'funny' })
    public name!: string;

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public updatedAt!: Date;
}
