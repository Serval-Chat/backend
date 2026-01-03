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
    ban?: any;
}

