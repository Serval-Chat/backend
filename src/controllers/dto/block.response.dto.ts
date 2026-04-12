import { ApiProperty } from '@nestjs/swagger';

export class BlockProfileResponseDTO {
    @ApiProperty({ example: '60d0fe4f5311236168a109ca' })
    id!: string;

    @ApiProperty({ example: 'Mute and hide' })
    name!: string;

    @ApiProperty({ example: 1024 })
    flags!: number;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;
}

export class BlockRelationshipResponseDTO {
    @ApiProperty({ example: '60d0fe4f5311236168a109cb' })
    targetUserId!: string;

    @ApiProperty({ example: 'BlockedUser' })
    targetUsername!: string;

    @ApiProperty({ example: '60d0fe4f5311236168a109ca' })
    profileId!: string;

    @ApiProperty({ example: 1024 })
    flags!: number;
}
