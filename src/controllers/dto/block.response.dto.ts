import { ApiProperty } from '@nestjs/swagger';

export class BlockProfileResponseDTO {
    @ApiProperty({ example: '60d0fe4f5311236168a109ca' })
    public id!: string;

    @ApiProperty({ example: 'Mute and hide' })
    public name!: string;

    @ApiProperty({ example: 1024 })
    public flags!: number;

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public updatedAt!: Date;
}

export class BlockRelationshipResponseDTO {
    @ApiProperty({ example: '60d0fe4f5311236168a109cb' })
    public targetUserId!: string;

    @ApiProperty({ example: 'BlockedUser' })
    public targetUsername!: string;

    @ApiProperty({ example: '60d0fe4f5311236168a109ca' })
    public profileId!: string;

    @ApiProperty({ example: 1024 })
    public flags!: number;
}
