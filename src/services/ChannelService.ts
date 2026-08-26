import { injectable, inject } from 'inversify';
import { Inject } from '@nestjs/common';
import { TYPES } from '@/di/types';
import type {
    IChannelRepository,
    IChannel,
} from '@/di/interfaces/IChannelRepository';

@injectable()
export class ChannelService {
    public constructor(
        @inject(TYPES.ChannelRepository)
        @Inject(TYPES.ChannelRepository)
        private channelRepo: IChannelRepository,
    ) {}

    // Get-or-create a DM channel for exactly two recipients.
    public async getOrCreateDmChannel(
        userId: string,
        recipientId: string,
    ): Promise<IChannel> {
        const recipientIds = [userId, recipientId].sort();

        const existing =
            await this.channelRepo.findDmChannelByRecipients(recipientIds);
        if (existing !== null) return existing;

        return this.channelRepo.create({
            type: 'dm',
            recipientIds,
        });
    }
}
