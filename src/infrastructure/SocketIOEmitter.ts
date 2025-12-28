import { injectable } from 'inversify';
import { IEventEmitter } from '@/di/interfaces/IEventEmitter';
import { getIO } from '@/socket';

/**
 * Socket.IO Event Emitter Wrapper.
 *
 * Implements IEventEmitter interface using Socket.IO.
 */
@injectable()
export class SocketIOEmitter implements IEventEmitter {
    emitToUser(userId: string, event: string, data: any): void {
        const io = getIO();
        io.to(userId).emit(event, data);
    }

    emitToServer(serverId: string, event: string, data: any): void {
        const io = getIO();
        io.to(serverId).emit(event, data);
    }

    emitToRoom(room: string, event: string, data: any): void {
        const io = getIO();
        io.to(room).emit(event, data);
    }
}
