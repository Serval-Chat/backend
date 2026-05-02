import { Injectable } from '@nestjs/common';
import { injectable } from 'inversify';
import { Types } from 'mongoose';
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
@Injectable()
export class MongooseDmUnreadRepository implements IDmUnreadRepository {
    // Find all unread counts for a specific user
    public async findByUser(userId: Types.ObjectId): Promise<IDmUnread[]> {
        return await DmUnread.find({ user: userId }).lean();
    }

    // Find unread count for a user from a specific peer
    public async findByUserAndPeer(
        userId: Types.ObjectId,
        peerId: Types.ObjectId,
    ): Promise<IDmUnread | null> {
        return await DmUnread.findOne({ user: userId, peer: peerId }).lean();
    }

    // Increment the unread count for a user from a peer
    //
    // Uses upsert to create the record if it doesn't exist
    // Returns the new count after increment (atomic operation)
    public async increment(
        userId: Types.ObjectId,
        peerId: Types.ObjectId,
        session?: ClientSession,
    ): Promise<number> {
        const result = await DmUnread.findOneAndUpdate(
            { user: userId, peer: peerId },
            { $inc: { count: 1 } },
            { upsert: true, new: true, projection: { count: 1 }, session },
        );
        return result.count;
    }

    // Reset the unread count for a user from a peer to zero
    public async reset(userId: Types.ObjectId, peerId: Types.ObjectId): Promise<void> {
        await DmUnread.findOneAndUpdate(
            { user: userId, peer: peerId },
            { $set: { count: 0 } },
            { upsert: true, new: true, session: undefined },
        );
    }
}
