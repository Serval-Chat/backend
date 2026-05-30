import { ApiProperty } from '@nestjs/swagger';

export class InteractionSuccessResponseDTO {
    @ApiProperty()
    public success!: boolean;
}
