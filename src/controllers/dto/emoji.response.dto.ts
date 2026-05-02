import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class EmojiResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public imageUrl!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public createdBy!: string;

    @ApiPropertyOptional()
    public createdAt?: Date;
}
