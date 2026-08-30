import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty, IsString } from 'class-validator';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { IsLogin, IsPassword } from '@/validation/schemas/common';

export class EnablePasswordlessRequestDTO {
    @ApiProperty()
    @IsPassword()
    public password!: string;
}

export class RegenerateRecoveryKeysVerifyRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public flowId!: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsObject()
    public credential!: AuthenticationResponseJSON;
}

export class RecoveryKeyLoginRequestDTO {
    @ApiProperty()
    @IsLogin()
    public login!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public recoveryKey!: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public cfTurnstileResponse!: string;
}
