import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageEmbedFieldDTO {
    @ApiProperty()
    public name!: string;
    @ApiProperty()
    public value!: string;
    @ApiPropertyOptional()
    public inline?: boolean;
}

export class MessageEmbedAuthorDTO {
    @ApiProperty()
    public name!: string;
    @ApiPropertyOptional()
    public url?: string;
    @ApiPropertyOptional()
    public icon_url?: string;
}

export class MessageEmbedFooterDTO {
    @ApiProperty()
    public text!: string;
    @ApiPropertyOptional()
    public icon_url?: string;
}

export class MessageEmbedMediaDTO {
    @ApiProperty()
    public url!: string;
    @ApiPropertyOptional()
    public width?: number;
    @ApiPropertyOptional()
    public height?: number;
}

export class MessageEmbedProviderDTO {
    @ApiPropertyOptional()
    public name?: string;
    @ApiPropertyOptional()
    public url?: string;
}

export class MessageEmbedDTO {
    @ApiPropertyOptional({
        enum: ['rich', 'image', 'video', 'gifv', 'article', 'link', 'youtube'],
    })
    public type?: string;

    @ApiPropertyOptional()
    public color?: number;

    @ApiPropertyOptional()
    public title?: string;

    @ApiPropertyOptional()
    public url?: string;

    @ApiPropertyOptional()
    public description?: string;

    @ApiPropertyOptional()
    public timestamp?: string;

    @ApiPropertyOptional({ type: MessageEmbedAuthorDTO })
    public author?: MessageEmbedAuthorDTO;

    @ApiPropertyOptional({ type: MessageEmbedFooterDTO })
    public footer?: MessageEmbedFooterDTO;

    @ApiPropertyOptional({ type: MessageEmbedMediaDTO })
    public thumbnail?: MessageEmbedMediaDTO;

    @ApiPropertyOptional({ type: MessageEmbedMediaDTO })
    public image?: MessageEmbedMediaDTO;

    @ApiPropertyOptional({ type: MessageEmbedMediaDTO })
    public video?: MessageEmbedMediaDTO;

    @ApiPropertyOptional({ type: MessageEmbedProviderDTO })
    public provider?: MessageEmbedProviderDTO;

    @ApiPropertyOptional({ type: [MessageEmbedFieldDTO] })
    public fields?: MessageEmbedFieldDTO[];
}

export class MessageInteractionDTO {
    @ApiPropertyOptional()
    public id?: string;
}

export class MessagePollDTO {
    @ApiPropertyOptional()
    public id?: string;
}

export class MessageReactionDTO {
    @ApiProperty()
    public emoji!: string;

    @ApiProperty({ enum: ['unicode', 'custom'] })
    public type!: 'unicode' | 'custom';

    @ApiPropertyOptional()
    public emojiId?: string;

    @ApiProperty()
    public count!: number;

    @ApiProperty()
    public me!: boolean;
}

export class MessageAttachmentResponseDTO {
    @ApiProperty()
    public attachmentId!: string;

    @ApiProperty({ enum: ['image', 'video', 'audio', 'text', 'file'] })
    public type!: string;

    @ApiProperty()
    public mimeType!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public size!: number;

    @ApiPropertyOptional()
    public width?: number;

    @ApiPropertyOptional()
    public height?: number;

    @ApiPropertyOptional()
    public spoiler?: boolean;
}

export class ServerMessageResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public serverId!: string;

    @ApiProperty()
    public channelId!: string;

    @ApiProperty()
    public senderId!: string;

    @ApiProperty()
    public text!: string;

    @ApiProperty()
    public createdAt!: string;

    @ApiPropertyOptional()
    public editedAt?: string;

    @ApiProperty()
    public isEdited!: boolean;

    @ApiProperty()
    public isPinned!: boolean;

    @ApiProperty()
    public isSticky!: boolean;

    @ApiProperty()
    public isWebhook!: boolean;

    @ApiPropertyOptional()
    public webhookUsername?: string;

    @ApiPropertyOptional()
    public webhookAvatarUrl?: string;

    @ApiPropertyOptional()
    public replyToId?: string;

    @ApiProperty({ type: [MessageReactionDTO] })
    public reactions!: MessageReactionDTO[];

    @ApiProperty({ type: [MessageAttachmentResponseDTO] })
    public attachments!: MessageAttachmentResponseDTO[];

    @ApiProperty({ type: [MessageEmbedDTO] })
    public embeds!: MessageEmbedDTO[]; // TODO: MAKE ME EMBED OBJECT and EVERYTHING else.

    @ApiPropertyOptional()
    public stickerId?: string;

    @ApiPropertyOptional()
    public deletedAt?: string;

    @ApiProperty({ type: MessageInteractionDTO, nullable: true })
    public interaction!: MessageInteractionDTO | null;

    @ApiProperty({ type: MessagePollDTO, nullable: true })
    public poll!: MessagePollDTO | null;
}

export class GetMessageResponseDTO {
    @ApiProperty({ type: ServerMessageResponseDTO })
    public message!: ServerMessageResponseDTO;

    @ApiProperty({ type: ServerMessageResponseDTO, nullable: true })
    public repliedMessage!: ServerMessageResponseDTO | null;
}

export class MessageDeletedResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class PollVoteResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class BulkDeleteResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public deletedCount!: number;
}

export class TogglePinResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public isPinned!: boolean;
}

export class ToggleStickyResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public isSticky!: boolean;
}
