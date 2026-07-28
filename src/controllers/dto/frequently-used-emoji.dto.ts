import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    ArrayMaxSize,
    ValidateNested,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_FREQUENTLY_USED_EMOJIS } from '@/constants/frequentlyUsedEmoji';
import {
    FrequentlyUsedEmojiTypeDTO,
    IsFrequentlyUsedEmojiValue,
    IsFrequentlyUsedEmojiId,
} from './frequently-used-emoji.validators';

// Re-exported so existing `import { FrequentlyUsedEmojiTypeDTO } from
// './frequently-used-emoji.dto'` call sites keep working - the enum and its
// validators live in a sibling file because the custom class-validator
// decorators need `object`/`unknown` param types (matching class-validator's
// own `registerDecorator`/`validate` signatures), which the `*.dto.ts` lint
// rule disallows.
export { FrequentlyUsedEmojiTypeDTO };

export class FrequentlyUsedEmojiDTO {
    @ApiProperty({ example: '😀' })
    @IsFrequentlyUsedEmojiValue()
    public emoji!: string;

    @ApiProperty({ enum: FrequentlyUsedEmojiTypeDTO })
    @IsEnum(FrequentlyUsedEmojiTypeDTO)
    public emojiType!: FrequentlyUsedEmojiTypeDTO;

    @ApiProperty({ required: false, example: '1234567890123456789' })
    @IsFrequentlyUsedEmojiId()
    public emojiId?: string;

    @ApiProperty({ example: 3 })
    @IsInt()
    @Min(1)
    @Max(1_000_000)
    public count!: number;

    @ApiProperty({ example: '2026-07-27T12:00:00.000Z' })
    @IsISO8601()
    public lastUsedAt!: string;
}

export class UpdateFrequentlyUsedEmojisRequestDTO {
    @ApiProperty({ type: [FrequentlyUsedEmojiDTO] })
    @IsArray()
    @ArrayMaxSize(MAX_FREQUENTLY_USED_EMOJIS, {
        message: `emojis must contain at most ${MAX_FREQUENTLY_USED_EMOJIS} entries`,
    })
    @ValidateNested({ each: true })
    @Type(() => FrequentlyUsedEmojiDTO)
    public emojis!: FrequentlyUsedEmojiDTO[];
}

export class FrequentlyUsedEmojisResponseDTO {
    @ApiProperty({ type: [FrequentlyUsedEmojiDTO] })
    public emojis!: FrequentlyUsedEmojiDTO[];
}

export class UpdateFrequentlyUsedEmojisResponseDTO extends FrequentlyUsedEmojisResponseDTO {
    @ApiProperty()
    public message!: string;
}
