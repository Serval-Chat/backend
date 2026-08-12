import { z } from 'zod';
import * as schemas from '../messages.schema';

const SNOWFLAKE = '0254710804526399488';
const OTHER = '0254710804526399489';

const ID_FIELD = /(^|[a-z])(Id|ID)$/;
const NON_SNOWFLAKE_IDS = ['attachmentId'];

type AnySchema = z.ZodType<unknown>;

function unwrap(schema: unknown): z.ZodObject<z.ZodRawShape> | null {
    let current = schema;
    for (let i = 0; i < 10; i++) {
        if (current instanceof z.ZodObject) return current;
        const def = (current as { _def?: Record<string, unknown> })._def;
        if (def === undefined) return null;
        current = def.innerType ?? def.schema ?? def.in ?? null;
        if (current === null) return null;
    }
    return null;
}

function exported(): [string, AnySchema][] {
    return Object.entries(schemas).filter(
        ([name]) => name.endsWith('Schema') && name !== 'PingSchema',
    );
}

function idFields(name: string): string[] {
    const object = unwrap((schemas as Record<string, unknown>)[name]);
    if (object === null) return [];
    return Object.keys(object.shape).filter(
        (key) => ID_FIELD.test(key) && !NON_SNOWFLAKE_IDS.includes(key),
    );
}

function validPayload(name: string): Record<string, unknown> {
    const object = unwrap((schemas as Record<string, unknown>)[name]);
    if (object === null) return {};
    const payload: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(object.shape)) {
        const optional = (field as AnySchema).safeParse(undefined).success;
        if (key !== 'text' && optional) continue;
        if (ID_FIELD.test(key)) {
            payload[key] = key === 'attachmentId' ? 'abc-photo.png' : SNOWFLAKE;
        } else if (key === 'text' || key === 'status') {
            payload[key] = key === 'status' ? 'online' : 'hello';
        } else if (key === 'emoji') {
            payload[key] = '🙂';
        } else if (key === 'messageType') {
            payload[key] = 'dm';
        } else if (key === 'isMuted' || key === 'isDeafened') {
            payload[key] = false;
        }
    }
    return payload;
}

describe('every WS id field is validated as a snowflake', () => {
    const cases = exported().flatMap(([name]) =>
        idFields(name).map((field) => [name, field] as const),
    );

    it('finds id fields to check', () => {
        expect(cases.length).toBeGreaterThanOrEqual(20);
    });

    it.each(cases)('%s.%s rejects a non-snowflake', (name, field) => {
        const schema = (schemas as Record<string, AnySchema>)[
            name
        ] as AnySchema;
        const base = validPayload(name);

        expect(schema.safeParse(base).success).toBe(true);

        for (const junk of [
            'user-1',
            '690f8f932e55a1d70629cded',
            '123',
            `${SNOWFLAKE}0`,
            '025471080452639948x',
            '',
        ]) {
            expect(schema.safeParse({ ...base, [field]: junk }).success).toBe(
                false,
            );
        }
    });
});

describe('every WS schema rejects unknown keys', () => {
    it.each(exported().map(([name]) => [name] as const))(
        '%s',
        (name: string) => {
            const schema = (schemas as Record<string, AnySchema>)[
                name
            ] as AnySchema;
            const base = validPayload(name);

            expect(schema.safeParse(base).success).toBe(true);
            expect(schema.safeParse({ ...base, notAField: 'x' }).success).toBe(
                false,
            );
        },
    );

    it('rejects an unknown key inside an attachment', () => {
        const result = schemas.SendMessageDmSchema.safeParse({
            receiverId: SNOWFLAKE,
            text: 'hi',
            attachments: [
                {
                    attachmentId: 'abc-photo.png',
                    type: 'file',
                    mimeType: 'application/octet-stream',
                    name: 'photo.png',
                    size: 10,
                    content: 'surprise',
                },
            ],
        });
        expect(result.success).toBe(false);
    });

    it('rejects an unknown key inside a poll option', () => {
        const result = schemas.SendMessageServerSchema.safeParse({
            serverId: SNOWFLAKE,
            channelId: OTHER,
            poll: {
                title: 'q',
                options: [{ text: 'a', votes: [] }],
                multiSelect: false,
            },
        });
        expect(result.success).toBe(false);
    });

    it('rejects a ping payload carrying a key', () => {
        expect(schemas.PingSchema.safeParse({}).success).toBe(true);
        expect(schemas.PingSchema.safeParse(undefined).success).toBe(true);
        expect(schemas.PingSchema.safeParse({ seq: 1 }).success).toBe(false);
    });
});

describe('noEmbedsUrls', () => {
    const base = { receiverId: SNOWFLAKE, text: 'see https://ser.chat' };

    it('accepts what the shipped client sends', () => {
        const result = schemas.SendMessageDmSchema.safeParse({
            ...base,
            noEmbedsUrls: ['https://ser.chat'],
        });
        expect(result.success).toBe(true);
    });

    it('accepts 25 urls and rejects 26', () => {
        const urls = (n: number) =>
            Array.from({ length: n }, (_, i) => `https://ser.chat/${i}`);

        expect(
            schemas.SendMessageDmSchema.safeParse({
                ...base,
                noEmbedsUrls: urls(25),
            }).success,
        ).toBe(true);
        expect(
            schemas.SendMessageDmSchema.safeParse({
                ...base,
                noEmbedsUrls: urls(26),
            }).success,
        ).toBe(false);
    });

    it('rejects a value that is not a url', () => {
        expect(
            schemas.SendMessageDmSchema.safeParse({
                ...base,
                noEmbedsUrls: ['not a url'],
            }).success,
        ).toBe(false);
    });
});
