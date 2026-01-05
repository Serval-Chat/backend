import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KickMemberRequestDTO {
    @ApiPropertyOptional()
    reason?: string;
}

export class BanMemberRequestDTO {
    @ApiProperty()
    userId!: string;

    @ApiPropertyOptional()
    reason?: string;

    @ApiPropertyOptional()
    deleteMessageDays?: number;
}

export class TransferOwnershipRequestDTO {
    @ApiProperty()
    newOwnerId!: string;
}
