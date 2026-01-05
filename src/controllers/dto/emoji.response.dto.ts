import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmojiResponseDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    imageUrl!: string;

    @ApiProperty()
    serverId!: string;

    @ApiProperty()
    createdBy!: string;

    @ApiPropertyOptional()
    createdAt?: Date;
}
