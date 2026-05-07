import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString } from 'class-validator';
import { type SerializedCustomStatus } from '@/utils/status';
import { FriendRequestDTO } from './types.dto';

export class FriendResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;

    @ApiProperty()
    public username!: string;

    @ApiPropertyOptional()
    public displayName?: string;

    @ApiProperty()
    public createdAt!: string | Date;

    @ApiProperty({ nullable: true, type: String })
    public profilePicture!: string | null;

    @ApiProperty({ nullable: true })
    public customStatus!: SerializedCustomStatus | null;

    @ApiPropertyOptional({ nullable: true })
    public latestMessageAt?: string | null;
}

export class IncomingFriendRequestResponseDTO {
    @ApiProperty()
    @IsMongoId()
    @IsString()
    public _id!: string;

    @ApiPropertyOptional()
    public from?: string;

    @ApiPropertyOptional()
    @IsMongoId()
    @IsString()
    public fromId?: string;

    @ApiProperty()
    public createdAt!: Date;
}

export class SendFriendRequestResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ type: FriendRequestDTO })
    public request!: FriendRequestDTO;
}

export class AcceptFriendRequestResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ nullable: true, type: FriendResponseDTO })
    public friend!: FriendResponseDTO | null;
}

export class FriendshipMessageResponseDTO {
    @ApiProperty()
    public message!: string;
}
