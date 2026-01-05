import { ApiProperty } from '@nestjs/swagger';

export class ReactionResponseDTO {
    @ApiProperty()
    emoji!: string;

    @ApiProperty()
    type!: 'unicode' | 'custom';

    @ApiProperty({ required: false })
    emojiId?: string;

    @ApiProperty()
    count!: number;

    @ApiProperty()
    me!: boolean;
}
