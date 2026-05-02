import { ApiProperty } from '@nestjs/swagger';

export class DashBoardStatsDTO {
    @ApiProperty()
    public users!: number;
    @ApiProperty({ type: [Number] })
    public usersSparkline!: number[];
    @ApiProperty()
    public activeUsers!: number;
    @ApiProperty({ type: [Number] })
    public activeUsersSparkline!: number[];
    @ApiProperty()
    public bans!: number;
    @ApiProperty({ type: [Number] })
    public bansSparkline!: number[];
    @ApiProperty()
    public servers!: number;
    @ApiProperty({ type: [Number] })
    public serversSparkline!: number[];
    @ApiProperty()
    public messages!: number;
    @ApiProperty({ type: [Number] })
    public messagesSparkline!: number[];
}
