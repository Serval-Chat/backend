import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';

export class EmojiResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    _id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    imageUrl!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    serverId!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    createdBy!: string;

    @ApiPropertyOptional()
    createdAt?: Date;
}
