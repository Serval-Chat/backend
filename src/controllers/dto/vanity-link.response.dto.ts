import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VanityLinkResponseDTO {
    @ApiProperty({ nullable: true })
    public code!: string | null;

    @ApiPropertyOptional()
    public createdByUserId?: string;

    @ApiPropertyOptional()
    public createdByUsername?: string;

    @ApiPropertyOptional()
    public createdAt?: Date;
}

export class VanityLinkDeletedResponseDTO {
    @ApiProperty()
    public message!: string;
}
