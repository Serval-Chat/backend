import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';
import { IsRoleId } from '@/validation/schemas/common';

export class UpdateDefaultRoleRequestDTO {
    @ApiProperty({ description: 'The ID of the role to set as default' })
    @IsMongoId()
    @IsRoleId()
    public roleId!: string;
}
