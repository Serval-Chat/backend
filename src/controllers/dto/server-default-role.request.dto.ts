
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDefaultRoleRequestDTO {
    @ApiProperty({ description: 'The ID of the role to set as default' })
    roleId!: string;
}
