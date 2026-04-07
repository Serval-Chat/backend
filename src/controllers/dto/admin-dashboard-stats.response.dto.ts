import { ApiProperty } from '@nestjs/swagger';

export class DashBoardStatsDTO {
    @ApiProperty()
    users!: number;
    @ApiProperty({ type: [Number] })
    usersSparkline!: number[];
    @ApiProperty()
    activeUsers!: number;
    @ApiProperty({ type: [Number] })
    activeUsersSparkline!: number[];
    @ApiProperty()
    bans!: number;
    @ApiProperty({ type: [Number] })
    bansSparkline!: number[];
    @ApiProperty()
    servers!: number;
    @ApiProperty({ type: [Number] })
    serversSparkline!: number[];
    @ApiProperty()
    messages!: number;
    @ApiProperty({ type: [Number] })
    messagesSparkline!: number[];
}
