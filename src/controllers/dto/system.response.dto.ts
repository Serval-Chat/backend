import { ApiProperty } from '@nestjs/swagger';

export class SystemInfoResponseDTO {
    @ApiProperty()
    public version!: string;

    @ApiProperty()
    public commitHash!: string;

    @ApiProperty()
    public partialCommitHash!: string;
}
