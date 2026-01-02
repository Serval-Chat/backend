import { injectable } from 'inversify';
import {
    IDmUnreadRepository,
    IDmUnread,
} from '@/di/interfaces/IDmUnreadRepository';
import { DmUnread } from '@/models/DmUnread';

// Mongoose DM Unread repository
//
// Implements IDmUnreadRepository using Mongoose DmUnread model
@injectable()
export class MongooseDmUnreadRepository implements IDmUnreadRepository {
    // Find all unread counts for a specific user
    async findByUser(userId: string): Promise<IDmUnread[]> {
        return await DmUnread.find({ user: userId }).lean();
    }

    // Find unread count for a user from a specific peer
    async findByUserAndPeer(
        userId: string,
        peerId: string,
    ): Promise<IDmUnread | null> {
        return await DmUnread.findOne({ user: userId, peer: peerId }).lean();
    }

    // Increment the unread count for a user from a peer
    //
    // Uses upsert to create the record if it doesn't exist
    async increment(userId: string, peerId: string): Promise<void> {
        await DmUnread.updateOne(
            { user: userId, peer: peerId },
            { $inc: { count: 1 } },
            { upsert: true },
        );
    }

    // Reset the unread count for a user from a peer to zero
    async reset(userId: string, peerId: string): Promise<void> {
        await DmUnread.updateOne(
            { user: userId, peer: peerId },
            { count: 0 },
            { upsert: true },
        );
    }
}
