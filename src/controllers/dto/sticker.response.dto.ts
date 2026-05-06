import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString, IsDate, IsOptional, MaxLength } from 'class-validator';

export class StickerResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;

    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsString()
    public imageUrl!: string;

    @ApiProperty()
    public isAnimated!: boolean;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public createdBy!: string;

    @ApiPropertyOptional()
    @IsDate()
    @IsOptional()
    public createdAt?: Date;
}
