import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from './logger';

let cachedCommitHash: { commit: string; short: string } | null = null;
let cachedVersion: string | null = null;

/**
 * Get git commit hash information.
 *
 * @returns Full and short commit hash, or 'unknown' if git is (somehow) unavailable
 */
export function getGitCommitHash(): { commit: string; short: string } {
    if (cachedCommitHash) {
        return cachedCommitHash;
    }

    try {
        // Get the full commit hash
        const commit = execSync('git rev-parse HEAD', {
            cwd: process.cwd(),
            encoding: 'utf-8',
        }).trim();

        // Get the short commit hash
        const short = execSync('git rev-parse --short HEAD', {
            cwd: process.cwd(),
            encoding: 'utf-8',
        }).trim();

        const result = { commit, short };
        cachedCommitHash = result;
        return result;
    } catch (err) {
        logger.error('Failed to get git commit hash:', err);
        const result = { commit: 'unknown', short: 'unknown' };
        cachedCommitHash = result;
        return result;
    }
}

/**
 * Get application version from package.json.
 *
 * @returns Version string, defaults to 'unknown' if unavailable
 */
export function getVersion(): string {
    if (cachedVersion) {
        return cachedVersion;
    }

    try {
        // Read version from package.json
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(
                fs.readFileSync(packageJsonPath, 'utf-8'),
            );
            cachedVersion = packageJson.version || 'unknown';
            return cachedVersion!;
        }
    } catch (err) {
        logger.error('Failed to read version from package.json:', err);
    }
    cachedVersion = 'unknown';
    return cachedVersion;
}
