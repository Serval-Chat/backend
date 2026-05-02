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
    public login!: string;

    @ApiProperty()
    @IsPassword()
    public password!: string;
}

export class RegisterRequestDTO {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: ErrorMessages.AUTH.INVALID_EMAIL })
    public login!: string;

    @ApiProperty()
    @IsUsername()
    @MinLengthValidator(3, { message: ErrorMessages.AUTH.USERNAME_TOO_SHORT })
    public username!: string;

    @ApiProperty()
    @IsPassword()
    @MinLengthValidator(6, { message: ErrorMessages.AUTH.PASSWORD_TOO_SHORT })
    public password!: string;

    @ApiProperty()
    @IsInviteToken()
    public invite!: string;
}

export class ChangeLoginRequestDTO {
    @ApiProperty()
    @IsEmail()
    public newLogin!: string;

    @ApiProperty()
    @IsPassword()
    public password!: string;
}

export class ChangePasswordRequestDTO {
    @ApiProperty()
    @IsStrongPassword()
    public currentPassword!: string;

    @ApiProperty()
    @IsStrongPassword()
    public newPassword!: string;
}

export class PasswordResetRequestDTO {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail({}, { message: ErrorMessages.AUTH.INVALID_EMAIL })
    public email!: string;
}

export class PasswordResetConfirmDTO {
    @ApiProperty()
    @IsString()
    @MatchesValidator(/^[a-f0-9]{64}$/i, { message: 'Invalid token format' })
    public token!: string;

    @ApiProperty({ minLength: 8 })
    @MinLengthValidator(8)
    @IsStrongPassword()
    public newPassword!: string;
}
