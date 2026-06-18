import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { IEmbed } from '@/models/Embed';

export class DmSearchHitDTO {
    @ApiProperty() public id!: string;
    @ApiProperty() public senderId!: string;
    @ApiProperty() public receiverId!: string;
    @ApiProperty() public text!: string;
    @ApiPropertyOptional() public highlight?: string;
    @ApiProperty() public createdAt!: string;
    @ApiProperty({ type: 'array', items: { type: 'object' } })
    public embeds!: IEmbed[];
    @ApiProperty() public isWebhook!: boolean;
    @ApiPropertyOptional() public webhookUsername?: string;
    @ApiPropertyOptional() public webhookAvatarUrl?: string;
    @ApiPropertyOptional() public stickerId?: string;
}

export class DmMessageSearchResponseDTO {
    @ApiProperty({ type: [DmSearchHitDTO] }) public hits!: DmSearchHitDTO[];
    @ApiProperty() public total!: number;
}

export class ChannelSearchHitDTO {
    @ApiProperty() public id!: string;
    @ApiProperty() public senderId!: string;
    @ApiProperty() public channelId!: string;
    @ApiProperty() public serverId!: string;
    @ApiProperty() public text!: string;
    @ApiPropertyOptional() public highlight?: string;
    @ApiProperty() public createdAt!: string;
    @ApiProperty({ type: 'array', items: { type: 'object' } })
    public embeds!: IEmbed[];
    @ApiProperty() public isWebhook!: boolean;
    @ApiPropertyOptional() public webhookUsername?: string;
    @ApiPropertyOptional() public webhookAvatarUrl?: string;
    @ApiPropertyOptional() public stickerId?: string;
}

export class ChannelMessageSearchResponseDTO {
    @ApiProperty({ type: [ChannelSearchHitDTO] })
    public hits!: ChannelSearchHitDTO[];
    @ApiProperty() public total!: number;
}
