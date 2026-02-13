import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDTO {
    @ApiProperty()
    token!: string;
    @ApiProperty()
    username!: string;
}

export class RegisterResponseDTO {
    @ApiProperty()
    token!: string;
}

export class ChangeLoginResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    login!: string;
    @ApiProperty()
    token!: string;
}

export class ChangePasswordResponseDTO {
    @ApiProperty()
    message!: string;
    @ApiProperty()
    token!: string;
}

export class AuthErrorResponseDTO {
    @ApiProperty()
    error!: string;
    @ApiProperty({ required: false })
    ban?: Record<string, unknown>;
}

export class PasswordResetResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty({
        description: 'Request ID for support reference',
        example: 'a1b2c3d4e5f6g7h8',
    })
    requestId?: string;
}
