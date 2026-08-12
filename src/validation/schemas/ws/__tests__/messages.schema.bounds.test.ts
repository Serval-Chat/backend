import {
    AddReactionSchema,
    RemoveReactionSchema,
    SendMessageDmSchema,
    SendMessageServerSchema,
} from '../messages.schema';

function attachment(overrides: Record<string, unknown> = {}) {
    return {
        attachmentId: 'a1b2c3d4e5f60718293a-photo.webp',
        type: 'file',
        mimeType: 'application/octet-stream',
        name: 'photo.webp',
        size: 1024,
        ...overrides,
    };
}

function dm(attachments: unknown[]) {
    return { receiverId: 'user-1', text: 'hi', attachments };
}

function server(attachments: unknown[]) {
    return {
        serverId: 'server-1',
        channelId: 'channel-1',
        text: 'hi',
        attachments,
    };
}

describe.each([
    ['send_message_dm', SendMessageDmSchema, dm],
    ['send_message_server', SendMessageServerSchema, server],
] as const)('%s attachment bounds', (_name, schema, payload) => {
    it('accepts up to 10 attachments', () => {
        const result = schema.safeParse(
            payload(Array.from({ length: 10 }, () => attachment())),
        );
        expect(result.success).toBe(true);
    });

    it('rejects 11 attachments', () => {
        const result = schema.safeParse(
            payload(Array.from({ length: 11 }, () => attachment())),
        );
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe(
            'Too many attachments (max 10)',
        );
    });

    it('rejects the thousands-of-elements flood', () => {
        const result = schema.safeParse(
            payload(Array.from({ length: 5000 }, () => attachment())),
        );
        expect(result.success).toBe(false);
    });

    it.each(['attachmentId', 'mimeType', 'name'])(
        'rejects a %s longer than 255 characters',
        (field) => {
            const tooLong = schema.safeParse(
                payload([attachment({ [field]: 'x'.repeat(256) })]),
            );
            expect(tooLong.success).toBe(false);

            const atLimit = schema.safeParse(
                payload([attachment({ [field]: 'x'.repeat(255) })]),
            );
            expect(atLimit.success).toBe(true);
        },
    );

    it('still accepts a real upload-shaped attachment', () => {
        // 20 hex + '-' + a 200-char sanitized name is the longest attachmentId
        // config/multer.ts can generate.
        const generated = `${'a1b2c3d4e5f60718293a'}-${'n'.repeat(196)}.har`;
        expect(generated).toHaveLength(221);

        const result = schema.safeParse(
            payload([
                attachment({
                    attachmentId: generated,
                    name: `${'n'.repeat(196)}.har`,
                }),
            ]),
        );
        expect(result.success).toBe(true);
    });
});

describe.each([
    ['AddReactionSchema', AddReactionSchema],
    ['RemoveReactionSchema', RemoveReactionSchema],
] as const)('%s emoji bounds', (_name, schema) => {
    const base = { messageId: 'message-1', messageType: 'dm' as const };

    it('rejects an emoji longer than 100 characters', () => {
        const result = schema.safeParse({
            ...base,
            emoji: 'x'.repeat(101),
            emojiType: 'unicode',
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toBe('Emoji too long');
    });

    it('rejects a megabyte of text posing as an emoji', () => {
        const result = schema.safeParse({
            ...base,
            emoji: 'A'.repeat(1024 * 1024),
            emojiType: 'unicode',
        });
        expect(result.success).toBe(false);
    });

    it.each([
        ['a plain emoji', '👍'],
        ['a ZWJ sequence', '👨‍👩‍👧‍👦'],
        ['a skin-tone kiss sequence', '👨🏻‍❤️‍💋‍👨🏻'],
        ['a subdivision flag', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'],
    ])('accepts %s', (_label, emoji) => {
        const result = schema.safeParse({
            ...base,
            emoji,
            emojiType: 'unicode',
        });
        expect(result.success).toBe(true);
    });

    it('accepts a custom emoji name at the model maximum of 32', () => {
        const result = schema.safeParse({
            ...base,
            emoji: 'S'.repeat(32),
            emojiType: 'custom',
            emojiId: 'emoji-1',
        });
        expect(result.success).toBe(true);
    });
});

describe.each([
    ['send_message_dm', SendMessageDmSchema, dm],
    ['send_message_server', SendMessageServerSchema, server],
] as const)('%s poll expiry', (_name, schema, payload) => {
    function withPoll(expiresAt: string) {
        return {
            ...payload([]),
            poll: {
                title: 'Lunch?',
                options: [{ text: 'yes' }, { text: 'no' }],
                multiSelect: false,
                expiresAt,
            },
        };
    }

    it('rejects an expiry in the past', () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const result = schema.safeParse(withPoll(past));

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain(
            'Poll expiry must be in the future',
        );
    });

    it('accepts an expiry in the future', () => {
        const future = new Date(Date.now() + 3_600_000).toISOString();

        expect(schema.safeParse(withPoll(future)).success).toBe(true);
    });

    it('still accepts a poll with no expiry', () => {
        const { poll, ...rest } = withPoll(new Date().toISOString());
        const { expiresAt, ...pollWithout } = poll;

        expect(schema.safeParse({ ...rest, poll: pollWithout }).success).toBe(
            true,
        );
    });
});
