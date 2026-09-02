import type { IEmojiRepository } from '@/di/interfaces/IEmojiRepository';
import type { IStickerRepository } from '@/di/interfaces/IStickerRepository';
import type { PermissionService } from '@/permissions/PermissionService';

export async function assertNoUnauthorizedExternalEmoji(params: {
    permissionService: PermissionService;
    emojiRepo: IEmojiRepository;
    stickerRepo?: IStickerRepository;
    serverId: string;
    userId: string;
    channelId: string;
    emojiIds: string[];
    stickerId?: string;
    error: Error;
}): Promise<void> {
    const {
        permissionService,
        emojiRepo,
        stickerRepo,
        serverId,
        userId,
        channelId,
        emojiIds,
        stickerId,
        error,
    } = params;

    if (emojiIds.length === 0 && (stickerId === undefined || stickerId === ''))
        return;

    const [emojis, sticker] = await Promise.all([
        Promise.all(emojiIds.map((id) => emojiRepo.findById(id))),
        stickerId !== undefined && stickerId !== '' && stickerRepo !== undefined
            ? stickerRepo.findById(stickerId)
            : Promise.resolve(null),
    ]);

    const hasExternalEmoji = emojis.some(
        (emoji) => emoji !== null && emoji.serverId.toString() !== serverId,
    );
    const hasExternalSticker =
        sticker !== null && sticker.serverId.toString() !== serverId;

    if (!hasExternalEmoji && !hasExternalSticker) return;

    await permissionService.requireChannelPermission(
        serverId,
        userId,
        channelId,
        'useExternalEmojisAndStickers',
        error,
    );
}
