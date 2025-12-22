/**
 * Event Emitter Interface.
 *
 * A transport-agnostic abstraction for real-time event emissions.
 */
export interface IEventEmitter {
    /**
     * Emit an event to a specific user.
     */
    emitToUser(userId: string, event: string, data: any): void;

    /**
     * Emit an event to all members of a server.
     */
    emitToServer(serverId: string, event: string, data: any): void;

    /**
     * Emit an event to a specific room.
     */
    emitToRoom(room: string, event: string, data: any): void;
}
