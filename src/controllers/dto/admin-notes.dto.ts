import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { MAX_MESSAGE_LENGTH } from '@/config/env';

export class CreateAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_MESSAGE_LENGTH)
    public content!: string;
}

export class UpdateAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(MAX_MESSAGE_LENGTH)
    public content!: string;
}

export class SoftDeleteAdminNoteRequestDTO {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    public reason!: string;
}

export class AdminNoteAdminInfoDTO {
    @ApiProperty()
    public _id!: string;

    @ApiProperty()
    public username!: string;

    @ApiPropertyOptional()
    public displayName?: string;

    @ApiPropertyOptional()
    public profilePicture?: string;
}

export class AdminNoteHistoryDTO {
    @ApiProperty()
    public content!: string;

    @ApiProperty({ type: AdminNoteAdminInfoDTO })
    public editorId!: AdminNoteAdminInfoDTO;

    @ApiProperty()
    public editedAt!: Date;
}

export class AdminNoteResponseDTO {
    @ApiProperty()
    public _id!: string;

    @ApiProperty()
    public targetId!: string;

    @ApiProperty()
    public targetType!: string;

    @ApiProperty({ type: AdminNoteAdminInfoDTO })
    public adminId!: AdminNoteAdminInfoDTO;

    @ApiProperty()
    public content!: string;

    @ApiProperty({ type: [AdminNoteHistoryDTO], default: [] })
    public history!: AdminNoteHistoryDTO[];

    @ApiPropertyOptional()
    public deletedAt?: Date;

    @ApiPropertyOptional({ type: AdminNoteAdminInfoDTO })
    public deletedBy?: AdminNoteAdminInfoDTO;

    @ApiPropertyOptional()
    public deleteReason?: string;

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public updatedAt!: Date;
}
