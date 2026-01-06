// Event Emitter Interface
//
// A transport-agnostic abstraction for real-time event emissions
export interface IEventEmitter {
    // Emit an event to a specific user
    emitToUser(userId: string, event: string, data: unknown): void;
}
