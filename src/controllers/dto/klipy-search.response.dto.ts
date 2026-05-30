import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KlipyItemDetailsDTO {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | KlipyItemDetailsDTO
        | KlipyItemDetailsDTO[];
}

export class KlipyMetaDTO {
    [key: string]:
        | string
        | number
        | boolean
        | null
        | undefined
        | KlipyMetaDTO
        | KlipyMetaDTO[];
}
export class KlipySearchResponseDTO {
    @ApiProperty({
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: true,
        },
    })
    public data!: KlipyItemDetailsDTO[];

    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: true,
    })
    public meta?: KlipyMetaDTO;
}
