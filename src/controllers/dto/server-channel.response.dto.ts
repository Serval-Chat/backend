import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class ChannelResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public _id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ enum: ['text', 'voice', 'link'] })
    public type!: 'text' | 'voice' | 'link';

    @ApiProperty({ required: false })
    public description?: string;

    @ApiProperty()
    public position!: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public categoryId?: string | null;

    @ApiProperty({ required: false })
    public lastMessageAt?: Date;

    @ApiProperty({ required: false })
    public permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({ required: false })
    public createdAt?: Date;

    @ApiProperty({ required: false })
    public updatedAt?: Date;

    @ApiProperty({ required: false })
    public slowMode?: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    public slowModeNextMessageAllowedAt?: string | null;
}

export class ChannelWithReadResponseDTO extends ChannelResponseDTO {
    @ApiProperty({ required: false, nullable: true, type: String })
    // @ts-expect-error - Override generic type to string | null for JSON response
    declare public lastMessageAt?: string | null;

    @ApiProperty({ required: false, nullable: true, type: String })
    public lastReadAt!: string | null;
}

export class ChannelStatsResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public channelId!: string;

    @ApiProperty()
    public channelName!: string;

    @ApiProperty()
    public createdAt!: string;

    @ApiProperty()
    public messageCount!: number;
}

export class CategoryResponseDTO {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsMongoId()
    @IsString()
    public _id?: string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public serverId!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public position!: number;

    @ApiProperty({ required: false })
    public permissions?: Record<string, Record<string, boolean>>;

    @ApiProperty({ required: false })
    public createdAt?: Date;

    @ApiProperty({ required: false })
    public updatedAt?: Date;
}
