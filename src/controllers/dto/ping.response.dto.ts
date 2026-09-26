import {
    ApiProperty,
    ApiPropertyOptional,
    ApiExtraModels,
    getSchemaPath,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
    IsChannelId,
    IsServerId,
    IsSnowflakeId,
    IsUserId,
} from '@/validation/schemas/common';
import { PingMentionMessageDTO, PingExportMessageDTO } from './types.dto';

@ApiExtraModels(PingMentionMessageDTO, PingExportMessageDTO)
export class PingNotificationDTO {
    @ApiProperty()
    @IsSnowflakeId()
    @IsString()
    public id!: string;

    @ApiProperty({ enum: ['mention', 'export_status'] })
    public type!: 'mention' | 'export_status';

    @ApiProperty()
    public sender!: string;

    @ApiProperty()
    @IsUserId()
    @IsString()
    public senderId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsServerId()
    @IsString()
    public serverId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsChannelId()
    @IsString()
    public channelId?: string;

    @ApiProperty({
        oneOf: [
            { $ref: getSchemaPath(PingMentionMessageDTO) },
            { $ref: getSchemaPath(PingExportMessageDTO) },
        ],
    })
    public message!: PingMentionMessageDTO | PingExportMessageDTO;

    @ApiProperty()
    public timestamp!: number;
}

export class GetPingsResponseDTO {
    @ApiProperty({ type: [PingNotificationDTO] })
    public pings!: PingNotificationDTO[];
}

export class DeletePingResponseDTO {
    @ApiProperty()
    public success!: boolean;
}

export class ClearChannelPingsResponseDTO {
    @ApiProperty()
    public success!: boolean;

    @ApiProperty()
    public clearedCount!: number;
}
