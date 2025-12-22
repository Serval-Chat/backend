import type { Server } from 'socket.io';
import type { Container } from 'inversify';
import { RealTimeDispatcher } from './core/dispatcher';
import type { RealTimeModule } from './core/types';
import logger from '../utils/logger';

import { ChatGateway } from './gateways/ChatGateway';
import { ServerGateway } from './gateways/ServerGateway';
import { PresenceGateway } from './gateways/PresenceGateway';
import { StatusGateway } from './gateways/StatusGateway';
import { ReactionGateway } from './gateways/ReactionGateway';
import { SecurityGateway } from './gateways/SecurityGateway';

/**
 * RealTime Server.
 *
 * Entry point for the real-time (WebSocket) infrastructure.
 * Initializes the dispatcher and registers all gateway modules.
 */
export class RealTimeServer {
    private modules: RealTimeModule[] = [];
    private dispatcher: RealTimeDispatcher;

    constructor(private container: Container) {
        this.dispatcher = new RealTimeDispatcher(container);

        // Register default module
        this.registerModule({
            gateways: [
                ChatGateway,
                ServerGateway,
                PresenceGateway,
                StatusGateway,
                ReactionGateway,
                SecurityGateway,
            ],
        });
    }

    registerModule(module: RealTimeModule) {
        this.modules.push(module);
    }

    /**
     * Initializes the RealTime Server.
     *
     * Registers all gateways with the Socket.IO server and runs initialization hooks.
     *
     * @param io - The Socket.IO server instance.
     */
    initialize(io: Server) {
        logger.info('Initializing RealTime Server...');

        this.modules.forEach((module) => {
            // Register gateways
            if (module.gateways) {
                this.dispatcher.registerGateways(io, module.gateways);
            }

            // Run module init hook
            if (module.onInit) {
                module.onInit(io);
            }
        });

        logger.info(
            `RealTime Server initialized with ${this.modules.length} modules.`,
        );
    }
}
