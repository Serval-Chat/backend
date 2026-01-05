import { ApiProperty } from '@nestjs/swagger';

export class ChannelResponseDTO {
    @ApiProperty({ required: false })
    _id?: string;

    @ApiProperty()
    serverId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ enum: ['text', 'voice'] })
    type!: 'text' | 'voice';

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty()
    position!: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    categoryId?: string | null;

    @ApiProperty({ required: false })
    lastMessageAt?: Date;

    @ApiProperty({ required: false })
    permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({ required: false })
    createdAt?: Date;

    @ApiProperty({ required: false })
    updatedAt?: Date;
}

export class ChannelWithReadResponseDTO extends ChannelResponseDTO {
    @ApiProperty({ required: false, nullable: true, type: String })
    // @ts-ignore - Override generic type to string | null for JSON response
    declare lastMessageAt?: string | null;

    @ApiProperty({ required: false, nullable: true, type: String })
    lastReadAt!: string | null;
}

export class ChannelStatsResponseDTO {
    @ApiProperty()
    channelId!: string;

    @ApiProperty()
    channelName!: string;

    @ApiProperty()
    createdAt!: string;

    @ApiProperty()
    messageCount!: number;
}

export class CategoryResponseDTO {
    @ApiProperty({ required: false })
    _id?: string;

    @ApiProperty()
    serverId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    position!: number;

    @ApiProperty({ required: false })
    permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({ required: false })
    createdAt?: Date;

    @ApiProperty({ required: false })
    updatedAt?: Date;
}
