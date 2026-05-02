import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, ValidateNested, IsArray, MaxLength, IsMongoId, IsDefined } from 'class-validator';
import { Type } from 'class-transformer';
import { InteractionValue } from '@/types/interactions';

export class InteractionOptionDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsDefined()
    public value!: InteractionValue;
}

export class CreateInteractionRequestDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public command!: string;

    @ApiPropertyOptional({ type: () => [InteractionOptionDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InteractionOptionDTO)
    public options?: InteractionOptionDTO[];

    @ApiProperty()
    @IsMongoId()
    public serverId!: string;

    @ApiProperty()
    @IsMongoId()
    public channelId!: string;
}
