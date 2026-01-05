import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelRequestDTO {
    @ApiProperty()
    name!: string;

    @ApiProperty({ enum: ['text', 'voice'], required: false })
    type?: 'text' | 'voice';

    @ApiProperty({ required: false })
    position?: number;

    @ApiProperty({ required: false })
    categoryId?: string;

    @ApiProperty({ required: false })
    description?: string;
}

export class UpdateChannelRequestDTO {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false })
    position?: number;

    @ApiProperty({ required: false, nullable: true, type: String })
    categoryId?: string | null;

    @ApiProperty({ required: false })
    description?: string;
}

export class ChannelPositionDTO {
    @ApiProperty()
    channelId!: string;

    @ApiProperty()
    position!: number;
}

export class ReorderChannelsRequestDTO {
    @ApiProperty({ type: [ChannelPositionDTO] })
    channelPositions!: ChannelPositionDTO[];
}

export class CreateCategoryRequestDTO {
    @ApiProperty()
    name!: string;

    @ApiProperty({ required: false })
    position?: number;
}

export class UpdateCategoryRequestDTO {
    @ApiProperty({ required: false })
    name?: string;

    @ApiProperty({ required: false })
    position?: number;
}

export class CategoryPositionDTO {
    @ApiProperty()
    categoryId!: string;

    @ApiProperty()
    position!: number;
}

export class ReorderCategoriesRequestDTO {
    @ApiProperty({ type: [CategoryPositionDTO] })
    categoryPositions!: CategoryPositionDTO[];
}

export class UpdatePermissionsRequestDTO {
    @ApiProperty({
        description: 'Map of role/user IDs to permission overrides',
        example: { 'role_id': { 'sendMessages': true } }
    })
    permissions!: Record<string, Record<string, boolean>>;
}
