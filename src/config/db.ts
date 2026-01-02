import mongoose from 'mongoose';
import { MONGO_URI } from '@/config/env';
import logger from '@/utils/logger';

// Connects to MongoDB
// @throws {Error} If the connection to MongoDB fails
export const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        logger.info('Connected to MongoDB');
    } catch (err) {
        throw new Error('MongoDB connection failed: ' + err);
    }
};
