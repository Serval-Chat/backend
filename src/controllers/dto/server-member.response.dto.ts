import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserProfileResponseDTO } from './profile.response.dto';

export class ServerMemberResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public serverId!: string;

    @ApiProperty()
    public userId!: string;

    @ApiProperty({ type: [String] })
    public roles!: string[];

    @ApiPropertyOptional({ nullable: true })
    public nickname?: string | null;

    @ApiPropertyOptional({ nullable: true })
    public communicationDisabledUntil?: string | null;

    @ApiPropertyOptional()
    public joinedAt?: string;

    @ApiPropertyOptional()
    public createdAt?: string;

    @ApiPropertyOptional()
    public updatedAt?: string;
}

export class ServerMemberWithUserResponseDTO extends ServerMemberResponseDTO {
    @ApiProperty({ type: () => UserProfileResponseDTO, nullable: true })
    public user!: UserProfileResponseDTO | null;
}

export class OnboardingStateResponseDTO {
    @ApiProperty()
    public hasAcceptedRules!: boolean;

    @ApiProperty()
    public hasCompletedOnboarding!: boolean;

    @ApiPropertyOptional()
    public selectedSelfRoleIds?: string[];

    @ApiPropertyOptional()
    public selectedChannelIds?: string[];
}

export class ServerMemberListResponseDTO {
    @ApiProperty({ type: [ServerMemberWithUserResponseDTO] })
    public members!: ServerMemberWithUserResponseDTO[];

    @ApiPropertyOptional()
    public total?: number;
}

export class ServerMemberSearchResponseDTO {
    @ApiProperty({ type: [ServerMemberWithUserResponseDTO] })
    public members!: ServerMemberWithUserResponseDTO[];
}

export class MemberActionResponseDTO {
    @ApiProperty()
    public message!: string;
}

export class TimeoutResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty({ nullable: true })
    public communicationDisabledUntil!: string | null;
}

export class ServerBanResponseDTO {
    @ApiProperty()
    public userId!: string;

    @ApiPropertyOptional()
    public username?: string;

    @ApiPropertyOptional()
    public reason?: string;

    @ApiPropertyOptional()
    public bannedAt?: string;
}

export class TransferOwnershipResponseDTO {
    @ApiProperty()
    public message!: string;
}
