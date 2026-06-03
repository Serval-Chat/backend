import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { ServerDiscoveryService } from '@/services/ServerDiscoveryService';
import {
    DiscoveryServersResponseDTO,
    ListDiscoveryServersQueryDTO,
} from './dto/server-discovery.dto';

@Controller('api/v1/discovery')
@ApiTags('Server Discovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerDiscoveryController {
    public constructor(
        @Inject(TYPES.ServerDiscoveryService)
        private discoveryService: ServerDiscoveryService,
    ) {}

    @Get('servers')
    @ApiOperation({ summary: 'Search discoverable servers' })
    @ApiResponse({ status: 200, type: DiscoveryServersResponseDTO })
    public async listServers(
        @Query() query: ListDiscoveryServersQueryDTO,
    ): Promise<DiscoveryServersResponseDTO> {
        return await this.discoveryService.search({
            query: query.q,
            tags: query.tags,
            limit: query.limit ?? 20,
            cursor: query.cursor,
        });
    }
}
