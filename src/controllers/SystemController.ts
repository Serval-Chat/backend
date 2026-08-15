import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { getGitCommitHash, getVersion } from '@/utils/version';
import { SystemInfoResponseDTO } from './dto/system.response.dto';
import { Public } from '@/modules/auth/public.decorator';

@Controller('api/v1')
@ApiTags('System')
@Public()
export class SystemController {
    public constructor() {}

    @Get('system/info')
    @ApiOperation({ summary: 'Get system info' })
    @ApiOkResponse({
        type: SystemInfoResponseDTO,
        description: 'System info retrieved',
    })
    public async getSystemInfo(): Promise<SystemInfoResponseDTO> {
        const version = getVersion();
        const { short } = getGitCommitHash();

        return {
            version,
            partialCommitHash: short,
        };
    }
}
