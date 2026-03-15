import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class UpdateServerSettingsRequestDTO {
    @ApiProperty({
        description: 'Ordered list of server IDs and folder objects',
        example: ['server1', { id: 'folder1', name: 'Work', color: '#ff0000', serverIds: ['server2', 'server3'] }],
    })
    @IsArray()
    order!: (string | { id: string; name: string; color: string; serverIds: string[] })[];
}
