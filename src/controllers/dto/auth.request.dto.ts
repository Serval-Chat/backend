import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDTO {
    @ApiProperty()
    login!: string;
    @ApiProperty()
    password!: string;
}

export class RegisterRequestDTO {
    @ApiProperty()
    login!: string;
    @ApiProperty()
    username!: string;
    @ApiProperty()
    password!: string;
    @ApiProperty()
    invite!: string;
}

export class ChangeLoginRequestDTO {
    @ApiProperty()
    newLogin!: string;
    @ApiProperty({ required: false })
    password?: string;
}

export class ChangePasswordRequestDTO {
    @ApiProperty()
    currentPassword!: string;
    @ApiProperty()
    newPassword!: string;
}

