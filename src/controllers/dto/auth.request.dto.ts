import { ApiProperty } from '@nestjs/swagger';
import {
    Matches as MatchesValidator,
    MinLength as MinLengthValidator,
    IsEmail,
    IsString,
} from 'class-validator';
import {
    IsLogin,
    IsPassword,
    IsUsername,
    IsInviteToken,
    IsStrongPassword,
} from '@/validation/schemas/common';
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
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: ErrorMessages.AUTH.INVALID_EMAIL })
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
    @IsEmail()
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

export class PasswordResetRequestDTO {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: ErrorMessages.AUTH.INVALID_EMAIL })
    email!: string;
}

export class PasswordResetConfirmDTO {
    @ApiProperty()
    @IsString()
    @MatchesValidator(/^[a-f0-9]{64}$/i, { message: 'Invalid token format' })
    token!: string;

    @ApiProperty({ minLength: 8 })
    @MinLengthValidator(8)
    @IsStrongPassword()
    newPassword!: string;
}
