import { ApiProperty } from '@nestjs/swagger';

export class NotificationSoundResponseDTO {
    @ApiProperty()
    public id!: string;

    @ApiProperty()
    public name!: string;

    @ApiProperty()
    public url!: string;

    @ApiProperty()
    public enabled!: boolean;
}

export class NotificationSoundDeletedResponseDTO {
    @ApiProperty()
    public message!: string;
}
