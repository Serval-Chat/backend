import {
    Controller,
    Get,
    Route,
    Security,
    Response,
    Tags,
    Request,
    Header,
} from 'tsoa';
import { injectable, inject } from 'inversify';
import { TYPES } from '../di/types';
import { getGitCommitHash, getVersion } from '../utils/version';
import { register } from '../utils/metrics';
import type { ILogger } from '../di/interfaces/ILogger';
import express from 'express';
import { ErrorResponse } from './models/ErrorResponse';
import { ErrorMessages } from '../constants/errorMessages';

interface SystemInfo {
    version: string;
    commitHash: string;
    partialCommitHash: string;
}

interface VersionInfo {
    version: string;
    commit: string;
    short: string;
}

/**
 * Controller for retrieving system-level information and versioning.
 * Provides public endpoints for monitoring and version tracking.
 */
@injectable()
@Route('api/v1')
@Tags('System')
export class SystemController extends Controller {
    private static cachedVersion: VersionInfo | null = null;

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
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
