import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportStateResponseDTO {
    @ApiPropertyOptional()
    public state?: string;

    @ApiPropertyOptional()
    public availableAt?: Date;
}

export class ExportRequestResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public jobId!: string;
}
