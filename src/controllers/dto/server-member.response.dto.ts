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

export class ServerMemberWithPresenceResponseDTO extends ServerMemberWithUserResponseDTO {
    @ApiProperty()
    public online!: boolean;
}

export class ServerOnboardingConfigDTO {
    @ApiProperty()
    public enabled!: boolean;

    @ApiProperty({ type: [String] })
    public guidelines!: string[];

    @ApiProperty({ type: [String] })
    public selfAssignableRoleIds!: string[];

    @ApiPropertyOptional({ nullable: true })
    public landingChannelId?: string | null;

    @ApiProperty({ type: [String] })
    public welcomeChannelIds!: string[];
}

export class OnboardingStateResponseDTO {
    @ApiProperty({ type: ServerOnboardingConfigDTO })
    public onboarding!: ServerOnboardingConfigDTO;

    @ApiProperty({ type: ServerMemberResponseDTO })
    public member!: ServerMemberResponseDTO;
}

export class ServerMemberJoinedViaDTO {
    @ApiProperty({ enum: ['invite', 'vanity'] })
    public method!: 'invite' | 'vanity';

    @ApiProperty()
    public code!: string;
}

export class ServerMemberAdminEntryDTO extends ServerMemberWithUserResponseDTO {
    @ApiPropertyOptional({ type: ServerMemberJoinedViaDTO, nullable: true })
    public joinedVia?: ServerMemberJoinedViaDTO;
}

export class ServerMemberAdminListResponseDTO {
    @ApiProperty({ type: [ServerMemberAdminEntryDTO] })
    public members!: ServerMemberAdminEntryDTO[];

    @ApiProperty()
    public total!: number;

    @ApiProperty()
    public limit!: number;

    @ApiProperty()
    public offset!: number;
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
