import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class BatchCreateInvitesRequestDTO {
    @ApiProperty()
    @IsInt()
    @Min(1)
    @Max(1000)
    public count!: number;
}

export class InviteResponseDTO {
    @ApiProperty()
    public message!: string;

    @ApiProperty()
    public token?: string;

    @ApiProperty({ type: [String] })
    public tokens?: string[];
}
