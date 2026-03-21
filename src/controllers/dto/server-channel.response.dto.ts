import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ChannelResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    _id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    serverId!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    type!: 'text' | 'voice' | 'link';

    @ApiProperty({ required: false })
    description?: string;

    @ApiProperty()
    position!: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsString()
    categoryId?: string | null;

    @ApiProperty({ required: false })
    lastMessageAt?: Date;

    @ApiProperty({ required: false })
    permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({ required: false })
    createdAt?: Date;

    @ApiProperty({ required: false })
    updatedAt?: Date;

    @ApiProperty({ required: false })
    slowMode?: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    slowModeNextMessageAllowedAt?: string | null;
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
    @IsMongoId()
    @IsString()
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
    @IsOptional()
    @IsMongoId()
    @IsString()
    _id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
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
