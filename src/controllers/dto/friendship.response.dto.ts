import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { type SerializedCustomStatus } from '@/utils/status';

export class FriendResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
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
    @IsMongoId()
    @IsString()
    _id!: string;

    @ApiPropertyOptional()
    from?: string;

    @ApiPropertyOptional()
    @IsMongoId()
    @IsString()
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
