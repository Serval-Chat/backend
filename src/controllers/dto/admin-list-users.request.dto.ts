import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminListUsersRequestDTO {
    @ApiPropertyOptional()
    limit?: number;
    @ApiPropertyOptional()
    offset?: number;
    @ApiPropertyOptional()
    search?: string;
    @ApiPropertyOptional({ enum: ['banned', 'admin', 'recent'] })
    filter?: 'banned' | 'admin' | 'recent';
    @ApiPropertyOptional()
    includeDeleted?: boolean;
}