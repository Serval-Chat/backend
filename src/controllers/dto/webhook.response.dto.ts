import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public token!: string;

    @ApiPropertyOptional()
    public avatarUrl?: string;

    @ApiProperty()
    public createdBy!: string;

    @ApiProperty()
    public createdAt!: Date;
}

export class SimpleMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class AvatarUploadResponseDTO {
    @ApiProperty()
    public avatarUrl!: string;
}

export class WebhookExecuteResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public timestamp!: Date;
}
