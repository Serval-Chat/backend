import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    Matches,
    IsOptional,
    ValidateIf,
    Length,
} from 'class-validator';

export class TotpSetupResponseDTO {
    @ApiProperty()
    otpauthUri!: string;
}

export class TotpSetupConfirmRequestDTO {
    @ApiProperty({ description: '6 digit code from authenticator app' })
    @IsString()
    @Matches(/^\d{6}$/)
    code!: string;
}

export class TotpVerifyRequestDTO {
    @ApiProperty()
    @IsString()
    tempToken!: string;

    @ApiProperty({ required: false, description: '6 digit authenticator code' })
    @ValidateIf((o: TotpVerifyRequestDTO) => !o.backupCode)
    @IsString()
    @Matches(/^\d{6}$/)
    @IsOptional()
    code?: string;

    @ApiProperty({
        required: false,
        description: 'Backup code in XXXX-XXXX format',
    })
    @ValidateIf((o: TotpVerifyRequestDTO) => !o.code)
    @IsString()
    @Length(9, 9)
    @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
    @IsOptional()
    backupCode?: string;
}

export class TotpSensitiveActionRequestDTO {
    @ApiProperty({ required: false })
    @ValidateIf((o: TotpSensitiveActionRequestDTO) => !o.backupCode)
    @IsString()
    @Matches(/^\d{6}$/)
    @IsOptional()
    code?: string;

    @ApiProperty({ required: false })
    @ValidateIf((o: TotpSensitiveActionRequestDTO) => !o.code)
    @IsString()
    @Length(9, 9)
    @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i)
    @IsOptional()
    backupCode?: string;
}

export class TotpSetupConfirmResponseDTO {
    @ApiProperty({ type: [String] })
    backupCodes!: string[];
}
