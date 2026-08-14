import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import type { IRedisService } from '@/di/interfaces/IRedisService';

const LEGACY_PATTERNS = ['voice_channel:*', 'voice_states:*'];
const SCAN_COUNT = 500;

function isScoped(key: string): boolean {
    return key.split(':').length > 2;
}

export async function up(): Promise<number> {
    const redis = container.get<IRedisService>(TYPES.RedisService).getClient();
    let removed = 0;

    for (const pattern of LEGACY_PATTERNS) {
        let cursor = '0';
        do {
            const [next, keys] = await redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                SCAN_COUNT,
            );
            cursor = next;

            const legacy = keys.filter((key) => !isScoped(key));
            if (legacy.length > 0) {
                removed += await redis.del(...legacy);
            }
        } while (cursor !== '0');
    }

    console.log(`Removed ${removed} legacy unscoped voice keys`);
    return removed;
}

if (require.main === module) {
    void (async () => {
        try {
            await up();
            process.exit(0);
        } catch (error) {
            console.error('Cleanup failed:', error);
            process.exit(1);
        }
    })();
}
