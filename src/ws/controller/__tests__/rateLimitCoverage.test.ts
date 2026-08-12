import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTROLLER_DIR = join(__dirname, '..');

interface Handler {
    file: string;
    event: string;
    limit: { points: number; duration: number } | null;
}

function handlers(): Handler[] {
    const found: Handler[] = [];

    for (const file of readdirSync(CONTROLLER_DIR)) {
        if (!file.endsWith('Controller.ts')) continue;
        const lines = readFileSync(join(CONTROLLER_DIR, file), 'utf8').split(
            '\n',
        );

        lines.forEach((line, i) => {
            const event = /@Event\('([a-z_]+)'\)/.exec(line);
            if (event === null) return;

            let limit: Handler['limit'] = null;
            for (let j = i + 1; j < lines.length; j++) {
                const next = lines[j] ?? '';
                if (!next.trim().startsWith('@')) break;
                const rl = /@RateLimit\((\d+),\s*(\d+)\)/.exec(next);
                if (rl !== null) {
                    limit = {
                        points: Number(rl[1]),
                        duration: Number(rl[2]),
                    };
                }
            }
            found.push({ file, event: event[1] as string, limit });
        });
    }

    return found;
}

describe('WebSocket rate-limit coverage', () => {
    const all = handlers();

    it('finds every declared command', () => {
        expect(all.length).toBeGreaterThanOrEqual(23);
        expect(new Set(all.map((h) => h.event)).size).toBe(all.length);
    });

    it.each(all.map((h) => [h.event, h] as const))(
        '%s is rate limited',
        (_event, handler) => {
            expect(handler.limit).not.toBeNull();
        },
    );

    it('uses milliseconds for every window, not seconds', () => {
        for (const handler of all) {
            expect(handler.limit?.duration).toBeGreaterThanOrEqual(1000);
        }
    });

    it('keeps the fan-out commands at or below the send-message rate', () => {
        const perSecond = (h: Handler) =>
            (h.limit as { points: number; duration: number }).points /
            ((h.limit as { duration: number }).duration / 1000);

        const send = all.find((h) => h.event === 'send_message_server');
        const fanOut = all.filter((h) =>
            [
                'set_status',
                'set_presence_status',
                'update_voice_state',
                'add_reaction',
            ].includes(h.event),
        );

        expect(fanOut).toHaveLength(4);
        for (const handler of fanOut) {
            expect(perSecond(handler)).toBeLessThanOrEqual(
                perSecond(send as Handler),
            );
        }
    });
});
