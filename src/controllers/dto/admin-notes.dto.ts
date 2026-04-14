import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    content!: string;
}

export class UpdateAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(2000)
    content!: string;
}

export class SoftDeleteAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    reason!: string;
}

export class AdminNoteAdminInfoDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    username!: string;

    @ApiPropertyOptional()
    displayName?: string;

    @ApiPropertyOptional()
    profilePicture?: string;
}

export class AdminNoteHistoryDTO {
    @ApiProperty()
    content!: string;

    @ApiProperty({ type: AdminNoteAdminInfoDTO })
    editorId!: AdminNoteAdminInfoDTO;

    @ApiProperty()
    editedAt!: Date;
}

export class AdminNoteResponseDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    targetId!: string;

    @ApiProperty()
    targetType!: string;

    @ApiProperty({ type: AdminNoteAdminInfoDTO })
    adminId!: AdminNoteAdminInfoDTO;

    @ApiProperty()
    content!: string;

    @ApiProperty({ type: [AdminNoteHistoryDTO], default: [] })
    history!: AdminNoteHistoryDTO[];

    @ApiPropertyOptional()
    deletedAt?: Date;

    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    deletedBy?: AdminNoteAdminInfoDTO;

    @ApiPropertyOptional()
    deleteReason?: string;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}
