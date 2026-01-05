import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { type SerializedCustomStatus } from '@/utils/status';

export class FriendResponseDTO {
    @ApiProperty()
    _id!: string;

    @ApiProperty()
    username!: string;

    @ApiPropertyOptional()
    displayName?: string;

    @ApiProperty()
    createdAt!: string | Date;

    @ApiProperty({ nullable: true, type: String })
    profilePicture!: string | null;

    @ApiProperty({ nullable: true })
    customStatus!: SerializedCustomStatus | null;

    @ApiPropertyOptional({ nullable: true })
    latestMessageAt?: string | null;
}

export class IncomingFriendRequestResponseDTO {
    @ApiProperty()
    _id!: string;

    @ApiPropertyOptional()
    from?: string;

    @ApiPropertyOptional()
    fromId?: string;

    @ApiProperty()
    createdAt!: Date;
}

export class SendFriendRequestResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty()
    request!: unknown;
}

export class AcceptFriendRequestResponseDTO {
    @ApiProperty()
    message!: string;

    @ApiProperty({ nullable: true, type: FriendResponseDTO })
    friend!: FriendResponseDTO | null;
}

export class FriendshipMessageResponseDTO {
    @ApiProperty()
    message!: string;
}
