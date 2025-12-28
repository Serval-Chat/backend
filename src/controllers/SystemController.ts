import {
    Controller,
    Get,
    Route,
    Tags,
} from 'tsoa';
import { injectable } from 'inversify';
import { getGitCommitHash, getVersion } from '@/utils/version';

interface SystemInfo {
    version: string;
    commitHash: string;
    partialCommitHash: string;
}

/**
 * Controller for retrieving system-level information and versioning.
 * Provides public endpoints for monitoring and version tracking.
 */
@injectable()
@Route('api/v1')
@Tags('System')
export class SystemController extends Controller {
    constructor() {
        super();
    }

    /**
     * Retrieves commit hash, version and partial commit hash.
     */
    @Get('system/info')
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
