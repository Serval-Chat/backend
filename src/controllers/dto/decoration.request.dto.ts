import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class UploadDecorationRequestDTO {
    @ApiProperty()
    @IsString()
    @Length(2, 64)
    public name!: string;
}
