import { injectable } from 'inversify';
import type { ClientSession } from 'mongoose';
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
    public async findByUser(userId: string): Promise<IDmUnread[]> {
        return await DmUnread.find({ user: userId }).lean();
    }

    // Find unread count for a user from a specific peer
    public async findByUserAndPeer(
        userId: string,
        peerId: string,
    ): Promise<IDmUnread | null> {
        return await DmUnread.findOne({ user: userId, peer: peerId }).lean();
    }

    // Increment the unread count for a user from a peer
    //
    // Uses upsert to create the record if it doesn't exist
    // Returns the new count after increment (atomic operation)
    public async increment(
        userId: string,
        peerId: string,
        session?: ClientSession,
    ): Promise<number> {
        const result = await DmUnread.findOneAndUpdate(
            { user: userId, peer: peerId },
            { $inc: { count: 1 } },
            {
                upsert: true,
                returnDocument: 'after',
                projection: { count: 1 },
                session,
            },
        );
        return result.count;
    }

    // Reset the unread count for a user from a peer to zero
    public async reset(userId: string, peerId: string): Promise<void> {
        await DmUnread.findOneAndUpdate(
            { user: userId, peer: peerId },
            { $set: { count: 0 } },
            { upsert: true, returnDocument: 'after', session: undefined },
        );
    }

    // Delete the unread count record for a user from a peer
    public async delete(userId: string, peerId: string): Promise<void> {
        await DmUnread.deleteOne({ user: userId, peer: peerId });
    }

    // Delete all unread count records for a specific user
    public async deleteByUser(userId: string): Promise<void> {
        await DmUnread.deleteMany({ user: userId });
    }
}
