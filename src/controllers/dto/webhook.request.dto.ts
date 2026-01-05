import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateWebhookRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    avatarUrl?: string;
}

export class ExecuteWebhookRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    content!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    avatarUrl?: string;
}
