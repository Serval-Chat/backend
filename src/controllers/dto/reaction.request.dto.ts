import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IsEmojiId } from '@/validation/schemas/common';

export enum EmojiTypeDTO {
    UNICODE = 'unicode',
    CUSTOM = 'custom',
}

export enum ReactionScopeDTO {
    ME = 'me',
    ALL = 'all',
}

export class AddUnicodeReactionRequestDTO {
    @ApiProperty({ example: '👍' })
    @IsString()
    emoji!: string;

    @ApiProperty({ example: 'unicode', enum: [EmojiTypeDTO.UNICODE] })
    @IsEnum([EmojiTypeDTO.UNICODE])
    emojiType!: EmojiTypeDTO.UNICODE;
}

export class AddCustomReactionRequestDTO {
    @ApiProperty({ example: 'party_blob' })
    @IsString()
    emoji!: string;

    @ApiProperty({ example: 'custom', enum: [EmojiTypeDTO.CUSTOM] })
    @IsEnum([EmojiTypeDTO.CUSTOM])
    emojiType!: EmojiTypeDTO.CUSTOM;

    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    @IsEmojiId()
    emojiId!: string;
}

export type AddReactionRequestDTO =
    | AddUnicodeReactionRequestDTO
    | AddCustomReactionRequestDTO;

export class RemoveUnicodeReactionRequestDTO {
    @ApiProperty({ example: '👍' })
    @IsString()
    emoji!: string;

    @ApiProperty({ example: 'me', enum: ReactionScopeDTO, required: false })
    @IsOptional()
    @IsEnum(ReactionScopeDTO)
    scope?: ReactionScopeDTO;
}

export class RemoveCustomReactionRequestDTO {
    @ApiProperty({ example: '60d5ecb8b5c9c62b3c7c4b5e' })
    @IsEmojiId()
    emojiId!: string;

    @ApiPropertyOptional({ example: 'party_blob' })
    @IsOptional()
    @IsString()
    emoji?: string;

    @ApiPropertyOptional({ example: 'me', enum: ReactionScopeDTO })
    @IsOptional()
    @IsEnum(ReactionScopeDTO)
    scope?: ReactionScopeDTO;
}

export type RemoveReactionRequestDTO =
    | RemoveUnicodeReactionRequestDTO
    | RemoveCustomReactionRequestDTO;
