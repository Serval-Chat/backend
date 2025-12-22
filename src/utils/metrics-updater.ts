import { User } from '../models/User';
import { Message } from '../models/Message';
import { totalUsersGauge, totalMessagesGauge } from './metrics';
import logger from './logger';

const defaultUpdateInterval = 60000;

/**
 * Updates database-related metrics periodically
 */
export async function updateDatabaseMetrics() {
    try {
        const userCount = await User.countDocuments();
        const messageCount = await Message.countDocuments();

        totalUsersGauge.set(userCount);
        totalMessagesGauge.set(messageCount);

        logger.debug(
            `Metrics updated: ${userCount} users, ${messageCount} messages`,
        );
    } catch (error) {
        logger.error('Error updating database metrics:', error);
    }
}

/**
 * Starts periodic metrics updates
 * @param intervalMs Update interval in milliseconds (default: 1 minute)
 */
export function startMetricsUpdater(
    intervalMs: number = defaultUpdateInterval,
) {
    // Update immediately on start
    updateDatabaseMetrics();

    // Then update periodically
    setInterval(updateDatabaseMetrics, intervalMs);

    logger.info(`Metrics updater started (interval: ${intervalMs}ms)`);
}
