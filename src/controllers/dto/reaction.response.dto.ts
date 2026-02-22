import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ReactionResponseDTO {
    @ApiProperty()
    emoji!: string;

    @ApiProperty()
    type!: 'unicode' | 'custom';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    emojiId?: string;

    @ApiProperty()
    count!: number;

    @ApiProperty()
    me!: boolean;
}
