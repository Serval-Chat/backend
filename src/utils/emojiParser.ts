import { isValidSnowflakeId } from '@/utils/snowflake';

const MAX_EXTRACTED_EMOJI_IDS = 50;

export function extractCustomEmojiIds(text: string): string[] {
    const ids = new Set<string>();
    const emojiRegex = /<emoji:([a-zA-Z0-9_-]+)>/g;
    let match;

    while ((match = emojiRegex.exec(text)) !== null) {
        const id = match[1];
        if (id !== undefined && isValidSnowflakeId(id)) {
            ids.add(id);
            if (ids.size >= MAX_EXTRACTED_EMOJI_IDS) break;
        }
    }

    return [...ids];
}
