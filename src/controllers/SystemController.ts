import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { injectable } from 'inversify';
import { getGitCommitHash, getVersion } from '@/utils/version';

interface SystemInfo {
    version: string;
    commitHash: string;
    partialCommitHash: string;
}

// Controller for retrieving system-level information and versioning
// Provides public endpoints for monitoring and version tracking
@injectable()
@Controller('api/v1')
@ApiTags('System')
export class SystemController {
    constructor() { }

    // Retrieves commit hash, version and partial commit hash
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
