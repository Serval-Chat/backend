import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FileProxyMetaResponseDTO {
    @ApiProperty()
    public status!: number;

    @ApiProperty()
    public headers!: Record<string, string>;

    @ApiPropertyOptional()
    public size?: number;
}
