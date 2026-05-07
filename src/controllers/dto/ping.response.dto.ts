import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { PingMentionMessageDTO, PingExportMessageDTO } from './types.dto';

export class PingNotificationDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public id!: string;

    @ApiProperty({ enum: ['mention', 'export_status'] })
    public type!: 'mention' | 'export_status';

    @ApiProperty()
    public sender!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public senderId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    public serverId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    public channelId?: string;

    @ApiProperty({
        oneOf: [
            { $ref: '#/components/schemas/PingMentionMessageDTO' },
            { $ref: '#/components/schemas/PingExportMessageDTO' },
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
