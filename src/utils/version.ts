import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import logger from './logger';

/**
 * Get git commit hash information.
 *
 * @returns Full and short commit hash, or 'unknown' if git is (somehow) unavailable
 */
export function getGitCommitHash(): { commit: string; short: string } {
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

        return { commit, short };
    } catch (err) {
        logger.error('Failed to get git commit hash:', err);
        return { commit: 'unknown', short: 'unknown' };
    }
}

/**
 * Get application version from package.json.
 *
 * @returns Version string, defaults to 'unknown' if unavailable
 */
export function getVersion(): string {
    try {
        // Read version from package.json
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(
                fs.readFileSync(packageJsonPath, 'utf-8'),
            );
            return packageJson.version || 'unknown';
        }
    } catch (err) {
        logger.error('Failed to read version from package.json:', err);
    }
    return 'unknown';
}
