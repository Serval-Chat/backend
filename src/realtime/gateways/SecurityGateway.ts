import { injectable, inject } from 'inversify';
import { Gateway } from '@/realtime/core/decorators';
import { SocketContext, OnGatewayConnection } from '@/realtime/core/types';
import { TYPES } from '@/di/types';
import { IBanRepository } from '@/di/interfaces/IBanRepository';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import logger from '@/utils/logger';

/**
 * Security Gateway.
 *
 * Enforces connection policies and disconnects banned users.
 */
@injectable()
@Gateway()
export class SecurityGateway implements OnGatewayConnection {
    constructor(
        @inject(TYPES.BanRepository) private banRepo: IBanRepository,
        @inject(TYPES.UserRepository) private userRepo: IUserRepository,
    ) {}

    /**
     * Handles new socket connection.
     *
     * Checks if the user is banned.
     * If banned, emits 'ban' event with reason and disconnects the socket.
     */
    async handleConnection(ctx: SocketContext) {
        const { socket, user } = ctx;
        if (!user || !user.id) {
            logger.warn('[SecurityGateway] Connection without user ID');
            socket.disconnect(true);
            return;
        }

        const userId = user.id;

        try {
            await this.banRepo.checkExpired(userId);
            const activeBan = await this.banRepo.findActiveByUserId(userId);

            if (activeBan) {
                let issuedByUsername = 'System';
                if (activeBan.issuedBy) {
                    const issuer = await this.userRepo.findById(
                        activeBan.issuedBy.toString(),
                    );
                    if (issuer?.username) {
                        issuedByUsername = issuer.username;
                    }
                }

                socket.emit('ban', {
                    reason: activeBan.reason,
                    issuedBy: issuedByUsername,
                    expirationTimestamp: activeBan.expirationTimestamp,
                });

                logger.info(
                    `[SecurityGateway] Disconnecting banned user: ${user.username} (${userId})`,
                );
                socket.disconnect(true);
            }
        } catch (err) {
            logger.error('[SecurityGateway] Error checking ban status:', err);
        }
    }
}
