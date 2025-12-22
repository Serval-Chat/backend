import mongoose from 'mongoose';
import { MONGO_URI } from './env';
import logger from '../utils/logger';

/**
 * Connects to MangoDB (yum yum)
 * @throws {Error} If the connection to MongoDB fails.
 */
export const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        logger.info('Connected to MongoDB');
    } catch (err) {
        throw new Error('MongoDB connection failed: ' + err);
    }
};
