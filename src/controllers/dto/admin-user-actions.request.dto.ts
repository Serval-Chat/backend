import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminPermissions, ResetProfileRequestFieldTypeDTO } from './common.request.dto';

export class AdminResetProfileRequestDTO {
    @ApiProperty({ enum: ['bio', 'displayName', 'profilePicture', 'banner', 'pronouns'], isArray: true })
    fields!: ResetProfileRequestFieldTypeDTO[];
}

export class AdminSoftDeleteUserRequestDTO {
    @ApiPropertyOptional()
    reason?: string;
}

export class AdminUpdateUserPermissionsRequestDTO {
    @ApiProperty()
    permissions!: AdminPermissions;
}

export class AdminBanUserRequestDTO {
    @ApiProperty()
    reason!: string;
    @ApiProperty()
    duration!: number; // in minutes
}

export class AdminWarnUserRequestDTO {
    @ApiProperty()
    message!: string;
}

