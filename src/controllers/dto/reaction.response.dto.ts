import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ReactionResponseDTO {
    @ApiProperty()
    public emoji!: string;

    @ApiProperty()
    public type!: 'unicode' | 'custom';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public emojiId?: string;

    @ApiProperty()
    public count!: number;

    @ApiProperty()
    public me!: boolean;
}
