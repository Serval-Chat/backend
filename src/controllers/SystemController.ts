import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { injectable } from 'inversify';
import { getGitCommitHash, getVersion } from '@/utils/version';

interface SystemInfo {
    version: string;
    commitHash: string;
    partialCommitHash: string;
}

@injectable()
@Controller('api/v1')
@ApiTags('System')
export class SystemController {
    public constructor() {}

    @Get('system/info')
    @ApiOperation({ summary: 'Get system info' })
    @ApiResponse({ status: 200, description: 'System info retrieved' })
    public async getSystemInfo(): Promise<SystemInfo> {
        const version = getVersion();
        const { commit, short } = getGitCommitHash();

        return {
            version,
            commitHash: commit,
            partialCommitHash: short,
        };
    }
}
