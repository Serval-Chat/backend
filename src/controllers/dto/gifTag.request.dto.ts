import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import {
    IsGifTagId,
    IsTagExpression,
    IsTagName,
} from '@/validation/schemas/common';
import { MAX_BULK_TAG_IDS } from '@/constants/gifTags';

export class CreateGifTagRequestDTO {
    @ApiProperty({ description: 'Name of the tag', example: 'funny' })
    @IsTagName()
    public name!: string;
}

export class GifTagIdsRequestDTO {
    @ApiProperty({
        description: 'Tag ids to apply/remove',
        type: [String],
        example: ['0327554478565752832'],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_BULK_TAG_IDS)
    @IsGifTagId({ each: true })
    public tagIds!: string[];
}

export class SearchFavoriteGifsByTagRequestDTO {
    @ApiProperty({
        description: 'Boolean tag expression, e.g. (funny && silly) || cats',
        example: '(funny && silly) || (cats || servals)',
    })
    @IsTagExpression()
    public expression!: string;
}
