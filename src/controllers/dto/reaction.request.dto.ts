import { ApiProperty } from '@nestjs/swagger';

export class AddUnicodeReactionRequestDTO {
    @ApiProperty({ example: '👍' })
    emoji!: string;

    @ApiProperty({ example: 'unicode', enum: ['unicode'] })
    emojiType!: 'unicode';
}

export class AddCustomReactionRequestDTO {
    @ApiProperty({ example: 'party_blob' })
    emoji!: string;

    @ApiProperty({ example: 'custom', enum: ['custom'] })
    emojiType!: 'custom';

    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    emojiId!: string;
}

export type AddReactionRequestDTO = AddUnicodeReactionRequestDTO | AddCustomReactionRequestDTO;

export class RemoveUnicodeReactionRequestDTO {
    @ApiProperty({ example: '👍' })
    emoji!: string;

    @ApiProperty({ example: 'me', enum: ['me', 'all'], required: false })
    scope?: 'me' | 'all';
}

export class RemoveCustomReactionRequestDTO {
    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    emojiId!: string;

    @ApiProperty({ example: 'party_blob', required: false })
    emoji?: string;

    @ApiProperty({ example: 'me', enum: ['me', 'all'], required: false })
    scope?: 'me' | 'all';
}

export type RemoveReactionRequestDTO = RemoveUnicodeReactionRequestDTO | RemoveCustomReactionRequestDTO;
