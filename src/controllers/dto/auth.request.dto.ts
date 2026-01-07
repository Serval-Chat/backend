import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import {
    IsLogin,
    IsPassword,
    IsUsername,
    IsInviteToken,
    IsStrongPassword,
} from '@/validation/schemas/common';
import {
    IsEmail as IsEmailValidator,
    Matches as MatchesValidator,
    MinLength as MinLengthValidator,
    MaxLength as MaxLengthValidator,
} from 'class-validator';
import { ErrorMessages } from '@/constants/errorMessages';

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
    @MatchesValidator(/@/, { message: ErrorMessages.AUTH.INVALID_EMAIL })
    login!: string;

    @ApiProperty()
    @IsUsername()
    @MinLengthValidator(3, { message: ErrorMessages.AUTH.USERNAME_TOO_SHORT })
    username!: string;

    @ApiProperty()
    @IsPassword()
    @MinLengthValidator(6, { message: ErrorMessages.AUTH.PASSWORD_TOO_SHORT })
    password!: string;

    @ApiProperty()
    @IsInviteToken()
    invite!: string;
}

export class ChangeLoginRequestDTO {
    @ApiProperty()
    @IsLogin()
    @MatchesValidator(/^[a-zA-Z0-9._-]{3,24}$/, {
        message: ErrorMessages.AUTH.LOGIN_FORMAT,
    })
    newLogin!: string;

    @ApiProperty()
    @IsPassword()
    password!: string;
}

export class ChangePasswordRequestDTO {
    @ApiProperty()
    @IsStrongPassword()
    currentPassword!: string;

    @ApiProperty()
    @IsStrongPassword()
    newPassword!: string;
}
