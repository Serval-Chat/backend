import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import ipaddr from 'ipaddr.js';
import logger from '@/utils/logger';

const VPN_LISTS_DIR = path.join(process.cwd(), 'vpn-lists', 'output');
const REFRESH_URL_BASE =
    'https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CATEGORIES = ['vpn', 'datacenter'] as const;
const FAMILIES = ['ipv4', 'ipv6'] as const;
type Category = (typeof CATEGORIES)[number];
type ParsedRange = [ipaddr.IPv4 | ipaddr.IPv6, number];

export type IpRiskCategory = 'vpn' | 'datacenter';

@Injectable()
export class VpnDetectionService implements OnModuleDestroy {
    private ranges: Record<Category, ParsedRange[]> = {
        vpn: [],
        datacenter: [],
    };
    private refreshTimer: NodeJS.Timeout | null = null;

    public constructor() {
        for (const category of CATEGORIES) {
            this.ranges[category] = this.loadCategory(category);
        }
        this.logCounts('Loaded');
        this.scheduleRefresh();
    }

    public classify(ip: string): IpRiskCategory | null {
        if (!ipaddr.isValid(ip)) return null;

        const addr = ipaddr.parse(ip);
        const kind = addr.kind();

        for (const category of CATEGORIES) {
            for (const range of this.ranges[category]) {
                if (range[0].kind() !== kind) continue;
                if (addr.match(range)) {
                    return category;
                }
            }
        }

        return null;
    }

    public onModuleDestroy(): void {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
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
        const nextRanges: Record<Category, ParsedRange[]> = {
            vpn: [],
            datacenter: [],
        };

        try {
            for (const category of CATEGORIES) {
                nextRanges[category] = await this.fetchCategory(category);
            }
        } catch (err) {
            logger.error(
                '[VpnDetectionService] Failed to refresh IP range lists; keeping existing data',
                err,
            );
            return;
        }

        this.ranges = nextRanges;
        this.logCounts('Refreshed');
    }

    private async fetchCategory(category: Category): Promise<ParsedRange[]> {
        const ranges: ParsedRange[] = [];

        for (const family of FAMILIES) {
            const url = `${REFRESH_URL_BASE}/${category}/${family}.txt`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Failed to fetch ${url}: status ${res.status}`);
            }

            const text = await res.text();
            ranges.push(...this.parseLines(text, `${category}/${family}.txt`));
            this.writeCache(category, family, text);
        }

        return ranges;
    }

    private writeCache(
        category: Category,
        family: (typeof FAMILIES)[number],
        text: string,
    ): void {
        const filePath = path.join(VPN_LISTS_DIR, category, `${family}.txt`);
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, text);
        } catch (err) {
            logger.warn(
                `[VpnDetectionService] Failed to cache refreshed list to ${filePath}`,
                err,
            );
        }
    }

    private loadCategory(category: Category): ParsedRange[] {
        const ranges: ParsedRange[] = [];

        for (const family of FAMILIES) {
            const filePath = path.join(
                VPN_LISTS_DIR,
                category,
                `${family}.txt`,
            );
            if (!fs.existsSync(filePath)) continue;

            const text = fs.readFileSync(filePath, 'utf8');
            ranges.push(...this.parseLines(text, `${category}/${family}.txt`));
        }

        return ranges;
    }

    private parseLines(text: string, source: string): ParsedRange[] {
        const ranges: ParsedRange[] = [];

        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (trimmed === '') continue;

            try {
                ranges.push(ipaddr.parseCIDR(trimmed));
            } catch (err) {
                logger.warn(
                    `[VpnDetectionService] Skipping malformed CIDR "${trimmed}" in ${source}`,
                    err,
                );
            }
        }

        return ranges;
    }

    private logCounts(verb: string): void {
        logger.info(
            `[VpnDetectionService] ${verb} ${this.ranges.vpn.length} VPN ranges and ${this.ranges.datacenter.length} datacenter ranges`,
        );
    }
}
