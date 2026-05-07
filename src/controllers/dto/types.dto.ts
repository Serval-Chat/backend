import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsString, IsOptional } from 'class-validator';
import {
    InteractionValue,
    InteractionResolvedUser,
    InteractionResolvedChannel,
    InteractionResolvedRole,
} from '@/types/interactions';

export class UserSettingsDTO {
    @ApiPropertyOptional()
    public muteNotifications?: boolean;
    @ApiPropertyOptional()
    public useDiscordStyleMessages?: boolean;
    @ApiPropertyOptional({ enum: ['left', 'right'] })
    public ownMessagesAlign?: 'left' | 'right';
    @ApiPropertyOptional({ enum: ['left', 'right'] })
    public otherMessagesAlign?: 'left' | 'right';
    @ApiPropertyOptional()
    public showYouLabel?: boolean;
    @ApiPropertyOptional()
    public ownMessageColor?: string;
    @ApiPropertyOptional()
    public otherMessageColor?: string;
    @ApiPropertyOptional()
    public disableCustomUsernameFonts?: boolean;
    @ApiPropertyOptional()
    public disableCustomUsernameColors?: boolean;
    @ApiPropertyOptional()
    public disableCustomUsernameGlow?: boolean;
}

export class NotificationPreferencesDTO {
    @ApiProperty()
    public mention!: boolean;
    @ApiProperty()
    public friend_request!: boolean;
    @ApiProperty()
    public custom!: boolean;
}

export class InteractionResolvedUserDTO implements InteractionResolvedUser {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public id!: string;
    @ApiProperty()
    public username!: string;
    @ApiPropertyOptional()
    public displayName?: string;
    @ApiPropertyOptional()
    public profilePicture?: string;
    @ApiPropertyOptional()
    public isBot?: boolean;
}

export class InteractionResolvedChannelDTO implements InteractionResolvedChannel {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public id!: string;
    @ApiProperty()
    public name!: string;
    @ApiProperty()
    public type!: string;
}

export class InteractionResolvedRoleDTO implements InteractionResolvedRole {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public id!: string;
    @ApiProperty()
    public name!: string;
    @ApiPropertyOptional()
    public color?: string;
}

export class PingMentionMessageDTO {
    @ApiProperty()
    public messageId!: string;
    @ApiProperty()
    public text!: string;
    @ApiProperty()
    public createdAt!: string | Date;
}

export class PingExportMessageDTO {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public text!: string;
    @ApiProperty({ enum: ['success', 'failure', 'cancelled'] })
    public type!: 'success' | 'failure' | 'cancelled';
}

export class BanInfoDTO {
    @ApiProperty()
    public reason!: string;
    @ApiPropertyOptional()
    public expiresAt?: string;
}

export class FriendRequestDTO {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public from!: string;
    @ApiProperty()
    public to!: string;
    @ApiProperty()
    public status!: string;
    @ApiProperty()
    public createdAt!: string | Date;
}

export class AdminBanSampleDTO {
    @ApiProperty()
    public _id!: string;
    @ApiProperty()
    public userId!: string;
    @ApiPropertyOptional()
    public serverId?: string;
    @ApiProperty()
    public reason!: string;
    @ApiPropertyOptional()
    public expirationTimestamp?: string | Date;
    @ApiPropertyOptional()
    public active?: boolean;
    @ApiPropertyOptional()
    public issuedBy?: string;
    @ApiPropertyOptional()
    public bannedBy?: string;
    @ApiPropertyOptional()
    public timestamp?: string | Date;
    @ApiPropertyOptional()
    public createdAt?: string | Date;
}

export class AdminBanHistoryItemDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId()
    @IsString()
    public _id?: string;

    @ApiProperty()
    public reason!: string;

    @ApiProperty()
    public timestamp!: Date | string;

    @ApiProperty()
    public expirationTimestamp!: Date | string;

    @ApiProperty()
    @IsMongoId()
    @IsString()
    public issuedBy!: string;

    @ApiProperty()
    public active!: boolean;
}

export type InteractionOptionValue = InteractionValue;
