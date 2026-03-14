import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class PingNotificationDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    id!: string;

    @ApiProperty({ enum: ['mention', 'export_status'] })
    type!: 'mention' | 'export_status';

    @ApiProperty()
    sender!: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    senderId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    serverId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    channelId?: string;

    @ApiProperty({ type: 'object', additionalProperties: true })
    message!: Record<string, unknown>;

    @ApiProperty()
    timestamp!: number;
}

export class GetPingsResponseDTO {
    @ApiProperty({ type: [PingNotificationDTO] })
    pings!: PingNotificationDTO[];
}

export class DeletePingResponseDTO {
    @ApiProperty()
    success!: boolean;
}

export class ClearChannelPingsResponseDTO {
    @ApiProperty()
    success!: boolean;

    @ApiProperty()
    clearedCount!: number;
}
