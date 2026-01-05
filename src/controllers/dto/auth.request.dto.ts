import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
    IsLogin,
    IsPassword,
    IsUsername,
    IsInviteToken,
} from '@/validation/schemas/common';

export class LoginRequestDTO {
    @ApiProperty()
    @IsLogin()
    login!: string;

    @ApiProperty()
    @IsPassword()
    password!: string;
}

export class RegisterRequestDTO {
    @ApiProperty()
    @IsLogin()
    login!: string;

    @ApiProperty()
    @IsUsername()
    username!: string;

    @ApiProperty()
    @IsPassword()
    password!: string;

    @ApiProperty()
    @IsInviteToken()
    invite!: string;
}

export class ChangeLoginRequestDTO {
    @ApiProperty()
    @IsLogin()
    newLogin!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsPassword()
    password?: string;
}

export class ChangePasswordRequestDTO {
    @ApiProperty()
    @IsPassword()
    currentPassword!: string;

    @ApiProperty()
    @IsPassword()
    newPassword!: string;
}
