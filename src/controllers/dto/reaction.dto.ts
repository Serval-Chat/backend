import { ApiProperty } from '@nestjs/swagger';

export class AddUnicodeReactionRequest {
    @ApiProperty({ example: '👍' })
    emoji!: string;

    @ApiProperty({ example: 'unicode', enum: ['unicode'] })
    emojiType!: 'unicode';
}

export class AddCustomReactionRequest {
    @ApiProperty({ example: 'party_blob' })
    emoji!: string;

    @ApiProperty({ example: 'custom', enum: ['custom'] })
    emojiType!: 'custom';

    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    emojiId!: string;
}

export type AddReactionRequest = AddUnicodeReactionRequest | AddCustomReactionRequest;

export class RemoveUnicodeReactionRequest {
    @ApiProperty({ example: '👍' })
    emoji!: string;

    @ApiProperty({ example: 'me', enum: ['me', 'all'], required: false })
    scope?: 'me' | 'all';
}

export class RemoveCustomReactionRequest {
    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    emojiId!: string;

    @ApiProperty({ example: 'party_blob', required: false })
    emoji?: string;

    @ApiProperty({ example: 'me', enum: ['me', 'all'], required: false })
    scope?: 'me' | 'all';
}

export type RemoveReactionRequest = RemoveUnicodeReactionRequest | RemoveCustomReactionRequest;

export class ReactionResponse {
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
