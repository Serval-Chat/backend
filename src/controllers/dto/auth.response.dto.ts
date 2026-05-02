import { ApiProperty } from '@nestjs/swagger';
import { BanInfoDTO } from './types.dto';


export class LoginResponseDTO {
    @ApiProperty({ required: false })
    public token?: string;
    @ApiProperty({ required: false })
    public temp_token?: string;
    @ApiProperty({ required: false })
    public two_factor_required?: boolean;
    @ApiProperty()
    public username!: string;
}

export class RegisterResponseDTO {
    @ApiProperty()
    public token!: string;
}

export class ChangeLoginResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public login!: string;
    @ApiProperty()
    public token!: string;
}

export class ChangePasswordResponseDTO {
    @ApiProperty()
    public message!: string;
    @ApiProperty()
    public token!: string;
}

export class AuthErrorResponseDTO {
    @ApiProperty()
    public error!: string;
    @ApiProperty({ required: false, type: BanInfoDTO })
    public ban?: BanInfoDTO;
}

export class PasswordResetResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({
        description: 'Request ID for support reference',
        example: 'a1b2c3d4e5f6g7h8',
    })
    public requestId?: string;
}
