import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileProxyMetaResponseDTO {
    @ApiProperty()
    status!: number;

    @ApiProperty()
    headers!: Record<string, string>;

    @ApiPropertyOptional()
    size?: number;
}
