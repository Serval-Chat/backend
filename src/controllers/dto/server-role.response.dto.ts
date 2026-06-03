import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServerRolePermissionsDTO {
    @ApiPropertyOptional()
    public sendMessages?: boolean;

    @ApiPropertyOptional()
    public manageMessages?: boolean;

    @ApiPropertyOptional()
    public manageChannels?: boolean;

    @ApiPropertyOptional()
    public manageRoles?: boolean;

    @ApiPropertyOptional()
    public banMembers?: boolean;

    @ApiPropertyOptional()
    public kickMembers?: boolean;

    @ApiPropertyOptional()
    public manageInvites?: boolean;

    @ApiPropertyOptional()
    public manageServer?: boolean;

    @ApiPropertyOptional()
    public administrator?: boolean;

    @ApiPropertyOptional()
    public pingRolesAndEveryone?: boolean;

    @ApiPropertyOptional()
    public pinMessages?: boolean;
}

export class ServerRoleResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public serverId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public color!: string;

    @ApiProperty()
    public position!: number;

    @ApiPropertyOptional()
    public icon?: string;

    @ApiPropertyOptional()
    public iconFileId?: string;

    @ApiProperty({ type: ServerRolePermissionsDTO })
    public permissions!: ServerRolePermissionsDTO;

    @ApiProperty()
    public isDefault!: boolean;

    @ApiPropertyOptional()
    public createdAt?: string;

    @ApiPropertyOptional()
    public updatedAt?: string;
}

export class RoleReorderResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class RoleDeleteResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class RoleIconResponseDTO {
    @ApiProperty()
    public icon!: string;
}
