import { ApiProperty } from '@nestjs/swagger';
import { IsRoleId } from '@/validation/schemas/common';

export class UpdateDefaultRoleRequestDTO {
    @ApiProperty({ description: 'The ID of the role to set as default' })
    @IsRoleId()
    roleId!: string;
}
