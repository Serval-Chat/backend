import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    MessageReactionDTO,
    MessageAttachmentResponseDTO,
    MessagePollDTO,
} from './server-message.response.dto';

export class DmUnreadCountDTO {
    @ApiProperty()
    public userId!: string;

    @ApiProperty()
    public unreadCount!: number;
}

export class UnreadCountsResponseDTO {
    @ApiProperty({ type: [DmUnreadCountDTO] })
    public unreadCounts!: DmUnreadCountDTO[];
}

export class DmMessageResponseDTO {
    @ApiProperty()
    public _id!: string;

    @ApiProperty()
    public senderId!: string;

    @ApiProperty()
    public receiverId!: string;

    @ApiProperty()
    public text!: string;

    @ApiProperty()
    public createdAt!: string;

    @ApiPropertyOptional()
    public editedAt?: string;

    @ApiProperty()
    public isEdited!: boolean;

    @ApiPropertyOptional()
    public replyToId?: string;

    @ApiProperty({ type: [MessageReactionDTO] })
    public reactions!: MessageReactionDTO[];

    @ApiProperty({ type: [MessageAttachmentResponseDTO] })
    public attachments!: MessageAttachmentResponseDTO[];

    @ApiPropertyOptional({ nullable: true })
    public deletedAt?: string | null;

    @ApiProperty({ type: MessagePollDTO, nullable: true })
    public poll!: MessagePollDTO | null;
}

export class DmMessageListResponseDTO {
    @ApiProperty({ type: [DmMessageResponseDTO] })
    public messages!: DmMessageResponseDTO[];
}

export class DmMessageDeleteResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class DmPollVoteResponseDTO {
    @ApiProperty()
    public message!: string;
}
