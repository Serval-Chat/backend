import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PingNotificationDTO {
    @ApiProperty()
    id!: string;

    @ApiProperty({ enum: ['mention'] })
    type!: 'mention';

    @ApiProperty()
    sender!: string;

    @ApiProperty()
    senderId!: string;

    @ApiPropertyOptional()
    serverId?: string;

    @ApiPropertyOptional()
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
