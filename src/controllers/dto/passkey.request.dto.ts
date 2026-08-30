import { ApiProperty } from '@nestjs/swagger';
import {
    IsObject,
    IsString,
    IsNotEmpty,
    IsOptional,
    MaxLength,
} from 'class-validator';
import type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
} from '@simplewebauthn/server';

export class PasskeyRegistrationVerifyRequestDTO {
    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsObject()
    public credential!: RegistrationResponseJSON;

    @ApiProperty({ required: false })
    @IsString()
    @MaxLength(64)
    @IsOptional()
    public name?: string;
}

export class PasskeyAuthenticationVerifyRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    public flowId!: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsObject()
    public credential!: AuthenticationResponseJSON;
}

export class RenamePasskeyRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    public name!: string;
}
