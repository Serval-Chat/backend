import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class SetVanityLinkRequestDTO {
    @ApiProperty()
    @IsString()
    @Length(2, 18, {
        message: 'code must be between 2 and 18 characters',
    })
    @Matches(/^[A-Za-z0-9]+$/, {
        message: 'code must only contain letters (a-z, A-Z) and numbers',
    })
    public code!: string;
}
