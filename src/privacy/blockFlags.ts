export const BlockFlags = {
    BLOCK_REACTIONS: 1 << 0,
    HIDE_FROM_MEMBER_LIST: 1 << 1,
    HIDE_FROM_MENTIONS: 1 << 2,
    BLOCK_FRIEND_REQUESTS: 1 << 3,
    HIDE_MY_PRESENCE: 1 << 4,
    HIDE_MY_PRONOUNS: 1 << 5,
    HIDE_MY_BIO: 1 << 6,
    HIDE_MY_DISPLAY_NAME: 1 << 7,
    HIDE_MY_AVATAR: 1 << 8,
    SPOILER_MESSAGES: 1 << 9,
    HIDE_REPLIES_TO_THEM: 1 << 10,
    HIDE_TYPING: 1 << 11,
    HIDE_THEIR_REACTIONS: 1 << 12,
    HIDE_IN_VOICE: 1 << 13,
    HIDE_THEIR_PRESENCE: 1 << 14,
} as const;

export const HIDE_MY_PROFILE_FIELDS =
    BlockFlags.HIDE_MY_PRONOUNS |
    BlockFlags.HIDE_MY_BIO |
    BlockFlags.HIDE_MY_DISPLAY_NAME |
    BlockFlags.HIDE_MY_AVATAR;
