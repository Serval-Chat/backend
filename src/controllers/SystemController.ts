import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { getGitCommitHash, getVersion } from '@/utils/version';
import { SystemInfoResponseDTO } from './dto/system.response.dto';

@Controller('api/v1')
@ApiTags('System')
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
        const { commit, short } = getGitCommitHash();

        return {
            version,
            commitHash: commit,
            partialCommitHash: short,
        };
    }
}
