import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import maxmind, { type CityResponse, type Reader } from 'maxmind';
import * as tar from 'tar';
import { MAXMIND_LICENSE_KEY } from '@/config/env';
import logger from '@/utils/logger';

const GEOIP_DIR = path.join(process.cwd(), 'gl2c');
const DB_FILENAME = 'GeoLite2-City.mmdb';
const DB_PATH = path.join(GEOIP_DIR, DB_FILENAME);
const ARCHIVE_PATH = path.join(GEOIP_DIR, '.GeoLite2-City.tar.gz');
const DOWNLOAD_URL =
    'https://download.maxmind.com/app/geoip_download' +
    `?edition_id=GeoLite2-City&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz`;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface GeoLocation {
    city?: string;
    country?: string;
}

@Injectable()
export class GeoIpService implements OnModuleDestroy {
    private reader: Reader<CityResponse> | null = null;
    private ensurePromise: Promise<void> | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;

    public async ensureDatabase(): Promise<void> {
        this.ensurePromise ??= this.doEnsureDatabase();
        return this.ensurePromise;
    }

    public lookup(ip: string): GeoLocation | null {
        if (this.reader === null || !maxmind.validate(ip)) return null;

        const result = this.reader.get(ip);
        if (result === null) return null;

        const city = result.city?.names.en;
        const country = result.country?.names.en;
        if (city === undefined && country === undefined) return null;

        return { city, country };
    }

    public onModuleDestroy(): void {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    private async doEnsureDatabase(): Promise<void> {
        if (MAXMIND_LICENSE_KEY === '') {
            logger.info(
                '[GeoIpService] MAXMIND_LICENSE_KEY not set; session locations will be unavailable.',
            );
            return;
        }

        await this.loadOrDownload();
        this.scheduleRefresh();
    }

    private async loadOrDownload(): Promise<void> {
        if (!fs.existsSync(DB_PATH)) {
            try {
                await this.downloadDatabase();
                logger.info(
                    `[GeoIpService] GeoLite2-City database ready at ${DB_PATH}`,
                );
            } catch (err) {
                logger.error(
                    '[GeoIpService] Failed to download GeoLite2-City database',
                    err,
                );
                return;
            }
        }

        try {
            this.reader = await maxmind.open<CityResponse>(DB_PATH);
        } catch (err) {
            logger.error(
                '[GeoIpService] Failed to open GeoLite2-City database',
                err,
            );
        }
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer !== null) return;

        this.refreshTimer = setInterval(() => {
            void this.refresh();
        }, REFRESH_INTERVAL_MS);
        this.refreshTimer.unref();
    }

    private async refresh(): Promise<void> {
        try {
            await this.downloadDatabase();
            this.reader = await maxmind.open<CityResponse>(DB_PATH);
            logger.info('[GeoIpService] Refreshed GeoLite2-City database');
        } catch (err) {
            logger.error(
                '[GeoIpService] Failed to refresh GeoLite2-City database; keeping existing data',
                err,
            );
        }
    }

    private async downloadDatabase(): Promise<void> {
        fs.mkdirSync(GEOIP_DIR, { recursive: true });

        const res = await fetch(DOWNLOAD_URL);
        if (!res.ok || res.body === null) {
            throw new Error(
                `GeoLite2-City download failed with status ${res.status}`,
            );
        }

        try {
            await pipeline(
                Readable.fromWeb(res.body as NodeWebReadableStream),
                fs.createWriteStream(ARCHIVE_PATH),
            );

            await tar.extract({
                file: ARCHIVE_PATH,
                cwd: GEOIP_DIR,
                strip: 1,
                filter: (entryPath) => entryPath.endsWith('.mmdb'),
            });
        } finally {
            fs.rmSync(ARCHIVE_PATH, { force: true });
        }

        if (!fs.existsSync(DB_PATH)) {
            throw new Error(
                'Extraction succeeded but GeoLite2-City.mmdb was not found in the archive',
            );
        }
    }
}
