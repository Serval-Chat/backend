import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicKeyResponseDTO {
    @ApiProperty()
    public publicKey!: string;
}

export class VapidStatusResponseDTO {
    @ApiProperty()
    public currentVersion!: string;

    @ApiProperty()
    public currentPublicKey!: string;
}

export class SuccessResponseDTO {
    @ApiProperty()
    public success!: boolean;
}

export class PushPreferencesResponseDTO {
    @ApiPropertyOptional()
    public mention?: boolean;

    @ApiPropertyOptional()
    public friend_request?: boolean;

    @ApiPropertyOptional()
    public custom?: boolean;
}
