import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray } from 'class-validator';

export class PollVoteRequestDTO {
    @ApiProperty()
    @IsArray()
    @IsString({ each: true })
    public optionIds!: string[];
}
