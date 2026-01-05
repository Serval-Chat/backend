import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UsernameGradientDTO {
    @ApiProperty()
    enabled!: boolean;

    @ApiProperty()
    colors!: string[];

    @ApiProperty()
    angle!: number;
}

export class UsernameGlowDTO {
    @ApiProperty()
    enabled!: boolean;

    @ApiProperty()
    color!: string;

    @ApiProperty()
    intensity!: number;
}

export class UpdateStatusRequestDTO {
    @ApiPropertyOptional()
    text?: string;

    @ApiPropertyOptional()
    emoji?: string;

    @ApiPropertyOptional()
    expiresAt?: string | null;

    @ApiPropertyOptional()
    expiresInMinutes?: number;

    @ApiPropertyOptional()
    clear?: boolean;
}

export class BulkStatusRequestDTO {
    @ApiProperty()
    usernames!: string[];
}

export class UpdateStyleRequestDTO {
    @ApiPropertyOptional()
    usernameFont?: string;

    @ApiPropertyOptional({ type: UsernameGradientDTO })
    usernameGradient?: UsernameGradientDTO;

    @ApiPropertyOptional({ type: UsernameGlowDTO })
    usernameGlow?: UsernameGlowDTO;
}

export class ChangeUsernameRequestDTO {
    @ApiProperty()
    newUsername!: string;
}

export class UpdateLanguageRequestDTO {
    @ApiProperty()
    language!: string;
}

export class UpdateBioRequestDTO {
    @ApiProperty()
    bio!: string;
}

export class UpdatePronounsRequestDTO {
    @ApiProperty()
    pronouns!: string;
}

export class UpdateDisplayNameRequestDTO {
    @ApiProperty()
    displayName!: string;
}

export class AssignBadgesRequestDTO {
    @ApiProperty()
    badgeIds!: string[];
}
