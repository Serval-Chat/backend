import { ApiProperty } from '@nestjs/swagger';

export class ServerBannerDTO {
    @ApiProperty()
    type!: string;

    @ApiProperty()
    value!: string;
}

export class CreateServerRequestDTO {
    @ApiProperty()
    name!: string;
}

export class UpdateServerRequestDTO {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false, type: ServerBannerDTO })
    banner?: ServerBannerDTO;

    @ApiProperty({ required: false })
    disableCustomFonts?: boolean;
}

export class SetDefaultRoleRequestDTO {
    @ApiProperty({ nullable: true, type: String })
    roleId!: string | null;
}
