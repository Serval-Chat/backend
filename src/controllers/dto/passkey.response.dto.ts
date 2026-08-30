import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { BanInfoDTO } from './types.dto';

export class PasskeyCredentialDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ enum: ['singleDevice', 'multiDevice'] })
    public deviceType!: 'singleDevice' | 'multiDevice';

    @ApiPropertyOptional({ type: [String] })
    public transports?: string[];

    @ApiProperty()
    public createdAt!: Date;

    @ApiPropertyOptional()
    public lastUsedAt!: Date | null;
}

export class PasskeyListResponseDTO {
    @ApiProperty({ type: [PasskeyCredentialDTO] })
    public passkeys!: PasskeyCredentialDTO[];
}

export class PasskeyRegistrationOptionsResponseDTO {
    @ApiProperty({ type: 'object', additionalProperties: true })
    public options!: PublicKeyCredentialCreationOptionsJSON;
}

export class PasskeyRegistrationVerifyResponseDTO {
    @ApiProperty({ type: PasskeyCredentialDTO })
    public passkey!: PasskeyCredentialDTO;
}

export class PasskeyAuthenticationOptionsResponseDTO {
    @ApiProperty()
    public flowId!: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    public options!: PublicKeyCredentialRequestOptionsJSON;
}

export class PasskeyLoginResponseDTO {
    @ApiPropertyOptional()
    public token?: string;

    @ApiProperty()
    public username!: string;
}

export class PasskeyLoginErrorResponseDTO {
    @ApiProperty()
    public error!: string;

    @ApiPropertyOptional({ type: BanInfoDTO })
    public ban?: BanInfoDTO;
}

export class PasskeyDeleteResponseDTO {
    @ApiProperty()
    public message!: string;
}
