import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UsernameGradientDTO, UsernameGlowDTO } from './profile.request.dto';

export class SimpleMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class UpdateBioResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public bio!: string;
}

export class UpdatePronounsResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public pronouns!: string;
}

export class UpdateDisplayNameResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ nullable: true })
    public displayName!: string | null;
}

export class CustomStatusDTO {
    @ApiProperty()
    public text!: string;

    @ApiPropertyOptional()
    public emoji?: string;

    @ApiPropertyOptional({ nullable: true })
    public expiresAt?: string | null;
}

export class UpdateCustomStatusResponseDTO {
    @ApiProperty({ type: CustomStatusDTO, nullable: true })
    public customStatus!: CustomStatusDTO | null;
}

export class BulkStatusesMapDTO {
    [key: string]: CustomStatusDTO | null;
}

export class BulkStatusesResponseDTO {
    @ApiProperty({
        type: () => BulkStatusesMapDTO,
        additionalProperties: { nullable: true },
    })
    public statuses!: BulkStatusesMapDTO;
}

export class UpdateStyleResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiPropertyOptional()
    public usernameFont?: string;

    @ApiPropertyOptional({ type: () => UsernameGradientDTO })
    public usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: () => UsernameGlowDTO })
    public usernameGlow?: UsernameGlowDTO;
}

export class ChangeUsernameResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public username!: string;
}

export class UpdateLanguageResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public language!: string;
}

export class VerifyConnectionResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    public connection!: { id: string; type: string; value: string };
}
