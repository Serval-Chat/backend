import { ApiProperty } from '@nestjs/swagger';

export class DmChannelResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty({ enum: ['dm', 'group_dm'] })
    public type!: 'dm' | 'group_dm';

    @ApiProperty({ type: [String] })
    public recipientIds!: string[];

    @ApiProperty()
    public createdAt!: string;

    @ApiProperty({ required: false, nullable: true })
    public lastMessageAt!: string | null;
}
