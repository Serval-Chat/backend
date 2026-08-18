import { ApiProperty } from '@nestjs/swagger';
import { IsIP } from 'class-validator';

export class UpdateSessionIpRequestDTO {
    @ApiProperty()
    @IsIP()
    public ip!: string;
}
