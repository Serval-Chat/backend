import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    ValidateNested,
    IsArray,
    MaxLength,
    IsDefined,
    IsBoolean,
    IsInt,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InteractionValue } from '@/types/interactions';
import type { IEmbed, IEmbedButton } from '@/models/Embed';
import { IsServerId, IsChannelId } from '@/validation/schemas/common';
export class InteractionOptionDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public name!: string;

    @ApiProperty()
    @IsDefined()
    public value!: InteractionValue;
}

export class CreateInteractionRequestDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(32)
    public command!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public commandId?: string;

    @ApiPropertyOptional({ type: () => [InteractionOptionDTO] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InteractionOptionDTO)
    public options?: InteractionOptionDTO[];

    @ApiProperty()
    @IsServerId()
    public serverId!: string;

    @ApiProperty()
    @IsChannelId()
    public channelId!: string;
}

export class CreateComponentInteractionRequestDTO {
    @ApiProperty()
    @IsServerId()
    public serverId!: string;

    @ApiProperty()
    @IsChannelId()
    public channelId!: string;

    @ApiProperty()
    @IsString()
    public messageId!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public invocationId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    public botUserId?: string;

    @ApiProperty()
    @IsInt()
    @Min(0)
    public componentIndex!: number;

    @ApiProperty()
    @IsString()
    @MaxLength(100)
    public customId!: string;
}

export class BotInteractionRespondDTO {
    @ApiProperty({
        description: 'ID of the server where the interaction occurred',
    })
    @IsServerId()
    public serverId!: string;

    @ApiProperty({
        description: 'ID of the channel where the interaction occurred',
    })
    @IsChannelId()
    public channelId!: string;

    @ApiProperty({
        description: 'ID of the user who triggered the interaction',
    })
    @IsString()
    public senderId!: string;

    @ApiPropertyOptional({ description: 'Text content of the response' })
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    public text?: string;

    @ApiPropertyOptional({
        description: 'Rich embeds to include in the response',
    })
    @IsOptional()
    @IsArray()
    public embeds!: IEmbed[];

    @ApiPropertyOptional({
        description: 'Interactive button components to include in the response',
    })
    @IsOptional()
    @IsArray()
    public components?: IEmbedButton[];

    @ApiPropertyOptional({
        description: 'ID of the invocation message to link against',
    })
    @IsOptional()
    @IsString()
    public invocationId?: string;

    @ApiPropertyOptional({
        description: 'When true, only the invoking user sees the response',
    })
    @IsOptional()
    @IsBoolean()
    public ephemeral?: boolean;
}
