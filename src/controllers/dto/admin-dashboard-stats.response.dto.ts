import { ApiProperty } from '@nestjs/swagger';

export class DashBoardStatsDTO {
    @ApiProperty()
    users!: number;
    @ApiProperty()
    usersTrend!: number;
    @ApiProperty()
    activeUsers!: number;
    @ApiProperty()
    activeUsersTrend!: number;
    @ApiProperty()
    bans!: number;
    @ApiProperty()
    bansTrend!: number;
    @ApiProperty()
    servers!: number;
    @ApiProperty()
    serversTrend!: number;
    @ApiProperty()
    messages!: number;
    @ApiProperty()
    messagesTrend!: number;
}