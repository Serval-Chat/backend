import { ApiProperty } from '@nestjs/swagger';
import { IChannel } from '@/di/interfaces/IChannelRepository';

export class CreateChannelRequest {
    @ApiProperty()
    name!: string;

    @ApiProperty({ enum: ['text', 'voice'], required: false })
    type?: 'text' | 'voice';

    @ApiProperty({ required: false })
    position?: number;

    @ApiProperty({ required: false })
    categoryId?: string;

    @ApiProperty({ required: false })
    description?: string;
}

export class UpdateChannelRequest {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false })
    position?: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    categoryId?: string | null;

    @ApiProperty({ required: false })
    description?: string;
}

export class ChannelPosition {
    @ApiProperty()
    channelId!: string;

    @ApiProperty()
    position!: number;
}

export class ReorderChannelsRequest {
    @ApiProperty({ type: [ChannelPosition] })
    channelPositions!: ChannelPosition[];
}

export class CreateCategoryRequest {
    @ApiProperty()
    name!: string;

    @ApiProperty({ required: false })
    position?: number;
}

export class UpdateCategoryRequest {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false })
    position?: number;
}

export class CategoryPosition {
    @ApiProperty()
    categoryId!: string;

    @ApiProperty()
    position!: number;
}

export class ReorderCategoriesRequest {
    @ApiProperty({ type: [CategoryPosition] })
    categoryPositions!: CategoryPosition[];
}

export class UpdatePermissionsRequest {
    @ApiProperty({
        description: 'Map of role/user IDs to permission overrides',
        example: { 'role_id': { 'sendMessages': true } }
    })
    permissions!: Record<string, Record<string, boolean>>;
}

export class ChannelResponse {
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

export class ChannelWithReadResponse extends ChannelResponse {
    @ApiProperty({ required: false, nullable: true, type: String })
    declare lastMessageAt?: any; // Override generic type to string | null for JSON response

    @ApiProperty({ required: false, nullable: true, type: String })
    lastReadAt!: string | null;
}

export class ChannelStatsResponse {
    @ApiProperty()
    channelId!: string;

    @ApiProperty()
    channelName!: string;

    @ApiProperty()
    createdAt!: string;

    @ApiProperty()
    messageCount!: number;
}

export class CategoryResponse {
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
