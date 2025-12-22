/**
 * API Error Messages
 */

export const ErrorMessages = {
    AUTH: {
        UNAUTHORIZED: 'Unauthorized',
        FORBIDDEN: 'Forbidden',
        INVALID_CREDENTIALS: 'Invalid credentials',
        INVALID_LOGIN_PASSWORD: 'Invalid login or password',
        ACCOUNT_BANNED: 'Your account has been banned',
        USER_NOT_FOUND: 'User not found',
        USERNAME_REQUIRED: 'Username is required',
        PASSWORD_REQUIRED: 'Password is required',
        EMAIL_REQUIRED: 'Email is required',
        USERNAME_TAKEN: 'Username is already taken',
        EMAIL_TAKEN: 'Email is already taken',
        INVALID_TOKEN: 'Invalid token',
        TOKEN_REQUIRED: 'Token is required',
        SESSION_EXPIRED: 'Session expired',
        INVALID_EMAIL: 'Invalid email address',
        USERNAME_TOO_SHORT: 'Username must be at least 3 characters long',
        PASSWORD_TOO_SHORT: 'Password must be at least 6 characters long',
        PASSWORD_TOO_LONG: 'Password cannot exceed 128 characters',
        PASSWORD_STRENGTH:
            'Password must include at least one letter, one number, and one special character',
        LOGIN_EXISTS: 'login already exists',
        USERNAME_EXISTS: 'username already exists',
        NEW_LOGIN_REQUIRED: 'New login is required',
        PASSWORD_CONFIRM_REQUIRED: 'Password is required to confirm changes',
        NEW_LOGIN_EMPTY: 'New login cannot be empty',
        LOGIN_FORMAT:
            'Login must be 3-24 characters and contain only letters, numbers, dots, underscores, or hyphens',
        NEW_LOGIN_SAME: 'New login must be different from the current login',
        LOGIN_TAKEN: 'Login already taken',
        INVALID_PASSWORD: 'Invalid password',
        FAILED_RETRIEVE_UPDATED_USER: 'Failed to retrieve updated user',
        CURRENT_PASSWORD_REQUIRED: 'Current password is required',
        NEW_PASSWORD_REQUIRED: 'New password is required',
        NEW_PASSWORD_TOO_SHORT:
            'New password must be at least 8 characters long',
        NEW_PASSWORD_SAME:
            'New password must be different from the current password',
        INVALID_CURRENT_PASSWORD: 'Invalid current password',
    },

    SERVER: {
        NOT_FOUND: 'Server not found',
        NOT_MEMBER: 'Not a member of this server',
        ALREADY_MEMBER: 'Already a member of this server',
        BANNED: 'You are banned from this server',
        ONLY_OWNER: 'Only the server owner can perform this action',
        OWNER_CANNOT_LEAVE: 'Owner cannot leave the server',
        TRANSFER_OWNERSHIP_ONLY_OWNER: 'Only owner can transfer ownership',
        INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
        NAME_REQUIRED: 'Server name is required',
        INVALID_ID: 'Invalid server ID',
        NO_PERMISSION_MANAGE: 'No permission to manage server',
        ONLY_OWNER_DELETE: 'Only owner can delete server',
        NOT_SERVER_MEMBER: 'Not a server member',
        FAILED_UPSERT_READ: 'Failed to upsert server channel read',
    },

    CHANNEL: {
        NOT_FOUND: 'Channel not found',
        NOT_IN_SERVER: 'Channel does not belong to this server',
        NO_PERMISSION_MANAGE: 'No permission to manage channels',
        NO_PERMISSION_SEND: 'No permission to send messages in this channel',
        CATEGORY_NOT_FOUND: 'Category not found',
    },

    MEMBER: {
        NOT_FOUND: 'Member not found',
        CANNOT_KICK_OWNER: 'Cannot kick server owner',
        CANNOT_BAN_OWNER: 'Cannot ban server owner',
        NO_PERMISSION_KICK: 'No permission to kick members',
        NO_PERMISSION_BAN: 'No permission to ban members',
        NO_PERMISSION_UNBAN: 'No permission to unban members',
        NO_PERMISSION_VIEW_BANS: 'No permission to view bans',
        NO_PERMISSION_MANAGE_ROLES: 'No permission to manage roles',
    },

    ROLE: {
        NOT_FOUND: 'Role not found',
        CANNOT_DELETE_EVERYONE: 'Cannot delete @everyone role',
        NO_PERMISSION_MANAGE: 'No permission to manage roles',
        NOT_IN_SERVER: 'Role does not belong to this server',
        CANNOT_SET_EVERYONE_DEFAULT: 'Cannot set @everyone as default role',
    },

    MESSAGE: {
        NOT_FOUND: 'Message not found',
        TEXT_REQUIRED: 'Message text is required',
        ONLY_SENDER_EDIT: 'Only sender can edit message',
        NO_PERMISSION_DELETE: 'No permission to delete message',
        CONTENT_REQUIRED: 'Content required',
        NOT_IN_CONVERSATION: 'Message not part of this conversation',
    },

    INVITE: {
        NOT_FOUND: 'Invite not found',
        EXPIRED: 'Invite expired',
        MAX_USES: 'Invite max uses reached',
        MAX_USES_REACHED: 'Invite max uses reached',
        CODE_EXISTS: 'Invite code already exists',
        ALREADY_EXISTS: 'Invite code already exists',
        NO_PERMISSION_MANAGE: 'No permission to manage invites',
        ONLY_OWNER_CUSTOM: 'Only server owner can create custom invites',
        INVALID_TOKEN: 'invalid invite token',
    },

    EMOJI: {
        NOT_FOUND: 'Emoji not found',
        FILE_REQUIRED: 'Emoji file is required',
        INVALID_NAME: 'Invalid emoji name',
        NAME_EXISTS: 'Emoji name already exists',
        NO_PERMISSION_MANAGE: 'No permission to manage emojis',
    },

    FILE: {
        NOT_FOUND: 'File not found',
        UPLOAD_FAILED: 'File upload failed',
        NO_FILE_UPLOADED: 'No file uploaded',
        FILENAME_REQUIRED: 'Filename required',
        INVALID_FILENAME: 'Invalid filename',
        INVALID_PATH: 'Invalid file path',
        SIZE_EXCEEDS_LIMIT: 'File size exceeds 15MB limit',
        DOWNLOAD_FAILED: 'Failed to download remote file',
        FAILED_DOWNLOAD: 'Failed to download file',
        FAILED_DOWNLOAD_REMOTE: 'Failed to download remote file',
        PROXY_FAILED: 'Failed to proxy file',
        FAILED_PROXY: 'Failed to proxy file',
        METADATA_FAILED: 'Failed to fetch metadata',
        FAILED_METADATA: 'Failed to fetch metadata',
        FAILED_FETCH_META: 'Failed to fetch metadata',
        FAILED_FETCH_RESOURCE: 'Failed to fetch resource',
        FAILED_STREAM: 'Failed to stream file',
        URL_REQUIRED: 'url query parameter is required',
        INVALID_URL: 'Invalid URL',
        HTTP_HTTPS_ONLY: 'Only http and https protocols are allowed',
        ONLY_HTTP_HTTPS: 'Only http and https protocols are allowed',
        HOSTNAME_REQUIRED: 'Hostname required',
        HOST_NOT_ALLOWED: 'URL host not allowed',
        DISALLOWED_ADDRESS: 'URL resolves to a disallowed address',
        FAILED_RESOLVE_HOSTNAME: 'Failed to resolve hostname',
        TOO_MANY_REDIRECTS: 'Too many redirects',
        DATA_MISSING: 'File data missing',
    },

    FRIENDSHIP: {
        NOT_FOUND: 'Friend request not found',
        REQUEST_NOT_FOUND: 'Friend request not found',
        CANNOT_ADD_SELF: 'Cannot add yourself',
        ALREADY_FRIENDS: 'Already friends',
        REQUEST_ALREADY_SENT: 'Friend request already sent',
        NOT_ALLOWED: 'Not allowed',
        NOT_PENDING: 'Request not pending',
        REQUEST_NOT_PENDING: 'Request not pending',
        NOT_FRIENDS: 'Users are not friends',
        USERNAME_REQUIRED: 'Username is required',
    },

    SYSTEM: {
        INTERNAL_ERROR: 'Internal server error',
        FAILED_TO_LOAD: 'Failed to load data',
        REQUIRED_FIELDS: 'Required fields are missing',
        FORBIDDEN: 'Forbidden',
        METRICS_NOT_CONFIGURED: 'Metrics security not configured',
        METRICS_SECURITY_NOT_CONFIGURED: 'Metrics security not configured',
        WEBHOOK_NOT_FOUND: 'Webhook not found',
        INVALID_WEBHOOK_TOKEN: 'Invalid webhook token',
        NO_PERMISSION_MANAGE_WEBHOOKS: 'No permission to manage webhooks',
        FAILED_GENERATE_TOKEN: 'Failed to generate unique token',
        AVATAR_NOT_FOUND: 'Avatar not found',
        CANNOT_READ_TOKENS: 'cannot read tokens file',
        FAILED_LOAD_WARNINGS: 'Failed to load warnings',
        WARNING_ID_REQUIRED: 'Warning ID is required',
        WARNING_NOT_FOUND: 'Warning not found',
        RESPONSE_NOT_FOUND: 'Response not found',
    },

    REACTION: {
        EMOJI_ID_REQUIRED: 'emojiId is required for custom emojis',
        CUSTOM_NOT_FOUND: 'Custom emoji not found',
        ALREADY_REACTED: 'User has already reacted with this emoji',
        MAX_REACTIONS: 'Maximum 20 reactions per message',
        EMOJI_OR_ID_REQUIRED: 'Either emoji or emojiId must be provided',
        ACCESS_DENIED: 'Access denied',
        REACTION_NOT_FOUND: 'Reaction not found',
        MISSING_PERMISSION_ADD: 'Missing permission: Add Reactions',
    },

    PROFILE: {
        INVALID_BADGE_IDS: 'Invalid badge IDs provided',
        INVALID_REQUEST_BADGE_ARRAY:
            'Invalid request: badgeIds must be an array',
        FAILED_UPLOAD_PICTURE: 'Failed to upload profile picture',
        DISPLAY_NAME_TOO_LONG: 'Display name too long',
        STATUS_TOO_LONG: 'Status text too long (max 120 characters)',
        ONLY_ONE_EMOJI: 'Only one emoji character allowed',
        INVALID_EMOJI: 'Invalid emoji character',
        STATUS_TEXT_OR_EMOJI_REQUIRED: 'Status text or emoji required',
        INVALID_EXPIRES_AT: 'Invalid expiresAt value',
        USERNAMES_ARRAY_REQUIRED: 'usernames array is required',
        NEW_USERNAME_REQUIRED: 'New username is required',
        USERNAME_START_CHAR:
            'Username must start with a letter, number, or underscore',
        USERNAME_CHARS:
            'Username can only contain letters, numbers, underscores, hyphens, and dots',
        USERNAME_CONSECUTIVE_DOTS: 'Username cannot contain consecutive dots',
        USERNAME_LENGTH: 'Username must be 3-20 characters',
        USERNAME_TAKEN: 'Username already taken',
    },

    ADMIN: {
        INVALID_FIELDS: 'Invalid fields provided',
    },
    WEBHOOK: {
        NOT_FOUND: 'Webhook not found',
        FORBIDDEN: 'No permission to manage webhooks',
        TOKEN_GENERATION_FAILED: 'Failed to generate unique token',
        INVALID_TOKEN: 'Invalid webhook token',
        AVATAR_NOT_FOUND: 'Avatar not found',
    },
    WEBPUSH: {
        CONFIG_FAILED: 'Failed to configure WebPush VAPID',
        SEND_FAILED: 'Failed to send push notification',
        GENERATE_KEYS_FAILED: 'Failed to generate VAPID keys',
    },
    PING: {
        REQUIRED_FIELDS:
            'targetUserId, sender, senderId, and message are required',
        ID_REQUIRED: 'ping id required',
        CHANNEL_ID_REQUIRED: 'channelId required',
    },
} as const;

/**
 * [[ YOU KNOW WHO ]] ascii art:
 ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡤⠀⠀⢀⣀⡀⢄⣀⣀⣀⠀⠠⠀⠒⠀⠈⠉⠛⠩⡉⢂⠑⡄⠀⠐⠒⠂⠤⠄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢏⢢⠀⠀⠀⢀⠄⢊⠜⠋⠉⠁⠀⠀⠀⠀⠀⡠⠒⠉⠀⡠⠃⠑⠺⢄⠀⠀⠀⠀⠉⠑⠢⢄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⡄⠑⣄⠈⡠⠊⠁⠀⠀⠀⠀⠀⠀⠀⢀⠔⢀⠀⠀⠘⠰⣆⠀⠀⠀⢢⠀⠀⠀⠂⠤⢄⡀⠈⠑⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠇⠀⣸⠊⠀⠀⠀⠀⠀⠀⠀⠀⡠⢂⠊⡰⠃⠀⠀⡆⠀⣏⠀⠀⠀⠀⠡⡀⠀⠀⠀⠀⠈⠁⠣⣔⡈⠢⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⠞⢁⠀⠀⠀⠀⠀⢀⠄⢀⠞⠀⢆⡜⠁⠀⠀⢰⠅⡀⠹⡇⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⠀⠀⠈⠉⠓⠚⠦⠄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⡡⢋⡔⠁⠀⠀⠀⡰⢀⠎⠠⡝⠀⢸⡜⠀⠀⠀⢀⢃⢡⢣⠀⢣⠀⠀⠀⠀⠀⢡⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠠⢐⠖⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠮⡎⡝⠀⠀⠀⢀⡞⠁⡞⢠⡝⠀⠀⣿⠃⠀⠀⠀⡜⡌⡜⡼⣆⠈⢣⠀⠀⠀⠀⠈⠀⣀⣀⠀⠀⠀⠠⠄⠂⢁⠔⠋⢃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠴⠊⠁⡜⡌⠀⠀⠀⢒⠞⢲⠸⢧⣿⠁⠀⢀⡟⠀⢀⠆⢠⠡⡰⡇⡘⢿⣦⡀⠣⡀⠀⠀⠀⡆⢢⠀⠀⠀⠀⠀⣠⠖⠁⠀⠀⠈⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡙⠀⢠⠁⠀⡌⡄⣎⡗⡡⡌⠀⠀⡼⠇⠀⡜⠀⡬⢤⠧⣇⢱⠀⠑⠱⢄⡈⠢⢄⠀⠇⢢⢣⠀⠀⡠⡪⢲⡆⠀⠀⠀⠀⢣⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣬⠀⢠⡇⠀⡜⡠⠐⢹⡌⠀⡇⠀⢰⢸⠀⢀⠇⡷⡆⠸⠀⡇⢩⠂⢄⠀⠀⠈⠁⠀⠀⠁⡎⡆⡤⢊⠔⠀⠀⣇⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢣⠀⣞⠁⢰⣯⣤⣤⡘⢅⠀⡇⠀⡄⡀⠀⢸⢠⢃⢀⡇⠀⣠⢨⠀⡇⠁⡆⠀⠀⠀⠀⠀⣇⠏⡗⠁⠀⠀⠀⢹⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⣄⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣎⢞⢰⢸⠀⡘⢈⣶⣶⣾⣵⠀⢳⡇⡇⡇⠀⢸⡎⣌⠸⠥⡀⠉⡄⠀⡇⠀⠀⠀⠀⠀⠀⠚⠀⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⠃⡏⢸⠀⡀⣇⢸⠉⢻⡽⢟⠁⠘⢷⢻⡅⠀⣺⣿⣭⣭⣿⣰⢤⣱⠀⠃⢀⡀⠀⠀⠀⠀⠇⢸⠀⠀⠀⠀⠀⠀⡀⠀⠀⡄⠀⡸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⢰⡏⠀⣇⡿⡦⣃⡘⣁⠎⠀⠀⠈⢻⠱⡀⠘⠛⠿⣟⣻⣿⡷⡝⣷⠀⣸⠀⠀⢸⢀⢲⠀⡆⢰⠀⠀⡇⠀⢠⡇⠀⡸⠀⢀⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⡀⠐⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠿⣀⡏⣇⢞⢼⠉⠑⠈⠀⠀⠀⠀⠉⠻⢄⣆⠸⣻⠟⠁⠹⠅⣸⢀⡋⠀⠀⡎⡸⡈⠰⠀⡛⠀⢠⠇⢀⢳⠁⢰⢁⢼⡘⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⢠⠎⠉⠐⠀⠀⠸⡆⠀⠀⠀⠀⠀⠀⠠⠄⡀⠀⠀⠀⢹⠊⠈⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣘⠢⢤⣠⡔⣎⠀⡇⡌⠃⠀⡸⢠⢣⡇⢆⢠⠁⢠⢻⠀⣌⣸⠀⢃⠎⡸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⢸⣆⠀⠀⠀⠀⢸⠃⠀⠀⢰⠉⠑⠤⠃⠀⡇⠀⠀⠀⠀⢂⠀⠀⠀⠀⠀⢀⡀⠀⠀⠀⠀⠀⢲⣿⡟⣾⣾⡦⠱⣸⣿⠘⠀⣰⡡⠁⠸⣇⢀⠇⠀⠎⡌⣼⡪⢷⠸⠃⡰⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠙⠲⠤⠄⠀⠎⠀⠀⠀⠈⢆⢄⠀⠀⢠⠃⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⠀⠑⠀⠀⠀⠀⠀⠈⠉⡝⠚⠿⠃⠆⡝⡝⡆⡴⠟⢁⠂⢀⢋⣬⢀⢊⡜⡼⠋⠀⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠒⠂⠁⠀⠀⠀⠀⠀⠀⠀⠈⢢⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢰⣣⡘⡀⠀⡎⢀⡧⠂⡏⡰⢱⠊⠀⠀⠀⠈⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠤⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠤⠀⣀⣀⣀⣀⣀⣀⣀⠀⠀⠤⠐⠂⠈⠋⡏⢱⢠⣿⡇⣬⣀⠀⢷⠁⠈⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠰⡉⠀⠀⡇⠀⠀⠀⠉⠀⠉⠉⠉⠉⠉⠁⣠⡔⠛⢆⠰⡼⣣⠀⠀⠀⠀⠀⠀⡠⠊⠀⡇⣿⣾⠛⠳⠇⠶⣭⣺⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⣀⠤⠤⠴⠿⡷⡀⠘⡄⢻⡿⠆⠀⠀⡠⠔⠁⠀⠀⣀⣿⣽⠟⠠⠠⠐⠂⠙⠋⣁⡅⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡜⠀⠀⠀⠀⠀⠱⡹⡄⢱⠈⣿⠘⡆⠁⠀⠀⣠⡖⠟⠋⣉⠠⠄⡀⠒⠂⠀⠋⠁⠩⣃⠒⢄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠁⠀⠀⠀⠀⠀⠀⢵⣿⡄⡇⢹⠘⠀⢀⣴⠟⢉⠤⡚⠭⠐⠈⠀⣀⠀⠠⠤⠀⠐⠂⠉⠉⠁⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⡀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡜⠀⠀⠀⠸⡀⠀⠀⣸⣿⣿⣤⢸⠀⡴⠋⣠⡾⢛⠭⠔⠂⠈⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠒⠀⠀⠐⠒⠤⢄⡀⠀⠀⠐⡀⡵⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠤⠤⡇⠀⠀⠀⠀⠀⠀⠀⢻⡇⠉⢻⣰⠊⣠⠾⠓⠉⠀⢀⡀⠀⣀⣤⣀⡀⠀⠀⠀⠀⠒⠂⠤⠤⢐⣣⠀⠀⠀⠀⠀⠀⠀⠀⡠⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠁⠀⠀⠀⠀⠀⠀⠸⣿⠡⠀⠀⠉⠉⠉⠉⠉⢩⣿⢼⡟⣅⠀⠀⠀⠀⠀⠀⠀⠠⠀⡀⠠⠀⠀⠀⠉⢢⡀⠀⠀⠀⢀⠞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡿⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡄⠀⠀⠀⢀⠁⠀⡄⣿⠀⠀⠀⠀⠀⠀⠀⢠⡿⣹⠀⢰⠸⡀⠀⠀⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⡰⠁⠀⠀⠀⣀⠔⠊⠁⠈⠉⠒⠠⠔⠊⠁⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡎⡇⠀⠀⠀⢸⠀⠀⣧⠁⠀⠀⠀⠀⠀⠀⢀⢧⠃⣿⠀⠈⡀⡇⠀⠀⠀⢀⡶⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⡜⠀⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠇⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡘⠀⡇⠀⠀⠀⠘⠀⠀⣋⡇⠀⠀⠀⠀⠀⠀⡸⡜⠀⢻⠀⠀⡇⢣⠀⠀⡠⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠀⠘⠀⠀⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠒⠒⠒⠒⠒⠒⢢
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡅⠀⠁⠀⠀⠀⡀⠀⢰⡿⡇⠀⠀⠀⠀⠀⠀⡇⡇⢰⢸⣰⠀⢱⢸⠀⡐⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠇⠀⡇⠀⠀⠀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⡇⠀⢸⣷⠁⠀⠀⠀⠀⠀⢠⢻⠀⡘⢸⣷⣀⠼⣼⡐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠀⢐⠁⠀⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢁⠀⠀⠀⠀⠀⡇⠀⠸⣯⠀⠀⠀⠀⠀⠀⠸⡾⠿⣿⡟⢽⠁⠊⢡⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠞⠤⠤⠼⠀⠀⠀⢸⠠⠤⠤⠤⠤⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡀⠀⠀⠀⠀⢰⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⡼⡇⢸⠀⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⠆⠀⠀⠀⡆⠀⠀⠀⢇⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢣⠀⠀⠀⠀⠀⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⡇⢸⠀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠂⡜⠀⠀⠀⠀⠸⡀⠀⠀⠀⠣⣀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⡆⠀⠀⠀⠀⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⣞⡘⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⣠⠊⠀⠀⠀⠀⠀⠀⠱⡀⠀⠀⠀⢈⠓⢄⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠀⠀⠀⠀⠁⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢈⠜⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⡠⠊⡜⠀⠀⠀⠀⠀⠀⠀⠀⠘⢄⠀⠀⠀⠠⡀⠑⢅⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡄⠀⠇⠀⠀⣸⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠊⠀⢀⠜⠀⠀⠀⠀⠀⠀⡠⠊⠀⡰⢠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⠀⠈⠀⠀⠑⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠘⡄⠸⠀⢠⢀⠂⠀⢃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⡠⠃⠀⠀⠀⠀⠀⡠⠊⠀⠀⡰⠁⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⢄⠀⠀⠀⠄⠀⢣⠤⠤⠤⠤⠀⠀⠀⠀⠀⠀⠤⠤⠤⠤⠼
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠘⠄⠀⠀⠘⠈⠄⠈⡄⠀⠀⠀⠀⠀⠀⠀⠀⣄⠜⠀⠀⠀⠀⠀⡠⠊⠀⡠⢀⡌⠀⡠⢠⠱⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢡⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢣⠀⠈⠄⠀⠀⢇⠈⢆⠰⡀⠀⠀⠀⠀⠀⠀⡠⠃⠀⠀⠀⠀⠀⢀⠠⠀⢁⠔⡙⠀⠌⠀⢸⠀⢸⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠐⠀⢱⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡆⠈⡄⠀⠈⠀⠀⠘⡄⠀⢂⢣⠀⠀⠀⠀⠀⠜⠀⠀⠀⠀⠀⠀⠂⠁⠀⡠⠂⠰⠁⠌⠀⠀⠀⠀⡼⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⢡⠀⠀⠀⠀⠀⢇⠣⠀⠊⠆⠀⠀⠀⡌⠀⠀⠀⠀⠀⠀⠀⢀⠔⠉⠀⢀⠃⡜⠀⠀⠀⠇⢜⠠⠈⢢⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡆⠀⠀⠀⢰⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠘⡄⠀⠀⠀⢸⠘⡀⠡⡀⠨⡄⠀⡘⠀⠀⠀⠀⠀⠀⡠⠂⠁⠀⠀⠀⡌⠰⠁⠀⠀⢠⠌⡜⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⡰⠁⠀⠀⢀⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠆⠀⢃⠀⠀⠀⠘⡄⢃⢀⠘⢄⠈⢲⠁⠀⠀⠀⠀⠄⠊⠀⠠⠐⠈⠀⡸⢠⠁⠀⠀⡠⠊⠰⠀⠀⠀⠀⡗⡄⠀⠀⠀⠀⠀⠀⢀⠔⠁⠀⠀⢀⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠈⠄⠈⡄⠀⠀⡀⣇⠘⡀⠑⢄⠑⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢡⢃⠂⠀⠀⠔⠁⡰⠁⠀⠀⠀⠀⡇⠘⡄⠀⠀⠀⢀⠔⠁⠀⠀⠀⡠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠃⠀⠈⠄⠘⡀⠀⠀⡇⢀⠰⠀⠀⡜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠃⠀⠀⡠⠊⢀⠔⠁⠀⠀⠀⠀⠀⡇⠀⠘⠄⢀⠔⠁⠀⠀⠀⢈⠔⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠀⠀⠈⢂⠀⠀⠀⢸⡄⢂⢁⠜⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠊⠀⠀⠊⠀⠐⠁⠀⠀⠀⠀⠀⠀⢀⠀⠠⠠⡈⠅⠀⠀⠀⢀⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡾⠀⠀⠀⠀⠀⠀⠀⢸⢁⣠⠎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⠀⠀⠀⠑⡈⠄⡠⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠺⣏⠳⣄⠀⠀⠀⠀⠀⠀⣘⣿⡏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⡻⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡆⠀⠀⠀⠀⠈⠜⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠚⠁⠀⠀⡇⠉⠺⣛⢦⠤⠤⢶⣟⣽⡙⡵⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⢡⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠀⠀⠀⠀⠀⠀⠈⢱⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⢀⠤⠪⠁⠀⠀⠀⠀⠀⡇⠀⠀⠀⠉⠁⠈⡟⣻⡿⠑⢼⢞⢢⡀⠀⠀⠀⠀⠀⠀⠀⢁⣴⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠃⠀⠀⠀⠀⠀⠀⠀⠀⣧⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣴⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⢧⡂⠄⢀⠀⢀⣼⢰⠋⠀⠀⠀⠑⠍⣚⡷⠶⢲⡶⠶⠶⢿⡛⣿⢇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡴⢪⠋⠀⠀⢠⣖⣢⠄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢠⠏⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢦⢓⠢⠤⠤⣬⢞⢆⠀⠀⠀⠀⠀⠀⠈⠁⠀⠛⠒⠀⣡⣾⠘⣦⣕⠤⡀⠀⠀⠀⣶⡆⠀⣶⡦⠀⠀⠀⠠⢐⣤⢶⢾⢿⡔⠁⠀⠀⣰⡟⠀⠀⠈⠁⠘⠲⡠⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢀⡎⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢸⠀⢰⢰⢡⠂⠈⠢⡀⠀⠀⠀⠀⠀⠀⠀⢀⡠⠊⡱⢡⠊⠁⠀⠁⡈⢆⠀⢀⣀⡀⠀⠉⠀⠀⠀⣀⡴⠛⢹⠀⠀⠸⠀⠀⠀⣰⡟⠀⠀⠀⠀⠀⠀⠀⠈⠑⢏⠡⠶⠤⣀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢸⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡼⣸⠈⣼⢁⠂⠄⢀⠙⢢⣀⣀⣀⣀⣀⠀⠀⠠⠤⣧⠇⠀⠀⠀⠀⠀⠈⠉⠉⠉⠛⠛⠻⢆⠴⠛⠁⠀⠀⡏⠀⢠⠃⢒⡮⠋⠁⠙⢶⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢢⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠘⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠧⣿⣰⠂⠄⠎⣠⡏⣰⣟⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⡰⠁⢀⠊⠀⠀⠀⠀⢘⡌⠄⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠃⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠙⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣼⡜⣼⣿⣼⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡪⠁⡴⠃⡀⣀⢄⡐⠠⠅⠒⠒⠂⠉⠉⠉⠉⠉⠉⠉⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠈⠳⣠⠄⡀⠀⠀⠀⣀⠀⡀⠀⠐⠒⠊⢉⣉⣻⡟⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⠄⠊⢁⠩⠟⠛⠋⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠁⠪⠤⡤⠥⠔⠒⠒⠒⠒⠈⠁⠀⠀⣼⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠤⠤⠤⠤⢤⡤⢶⠒⣰⣨⣧⡧⠔⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠠⠐⣦⡷⢟⣫⢷⡝⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡀⡠⠄⠂⠀⠀⢀⡠⠜⠛⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠂⢁⣀⣀⡀⠤⠚⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⠤⢀⣀⣀⡀⠀⠀⠀⢀⣈⡰⠤⠒⠈⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
 */
