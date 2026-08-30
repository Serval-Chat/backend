import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { BanInfoDTO } from './types.dto';

export class EnablePasswordlessResponseDTO {
    @ApiProperty({ type: [String] })
    public recoveryKeys!: string[];

    @ApiProperty()
    public token!: string;
}

export class RegenerateRecoveryKeysOptionsResponseDTO {
    @ApiProperty()
    public flowId!: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    public options!: PublicKeyCredentialRequestOptionsJSON;
}

export class RegenerateRecoveryKeysVerifyResponseDTO {
    @ApiProperty({ type: [String] })
    public recoveryKeys!: string[];
}

export class RecoveryKeyLoginResponseDTO {
    @ApiPropertyOptional()
    public token?: string;

    @ApiProperty()
    public username!: string;
}

export class RecoveryKeyLoginErrorResponseDTO {
    @ApiProperty()
    public error!: string;

    @ApiPropertyOptional({ type: BanInfoDTO })
    public ban?: BanInfoDTO;
}

export class AdminPasswordlessResetResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public temporaryPassword!: string;
}
