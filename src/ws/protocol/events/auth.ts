import type { WsEvent } from "@/ws/protocol/event";

/**
 * Client -> Server
 * Initiates authentication with a JWT token.
 */
export interface IWsAuthenticateEvent
    extends WsEvent<"authenticate", {
        token: string;
    }> { }

/**
 * Server -> Client
 * Sent after successful authentication.
 */
export interface IWsAuthenticatedEvent
    extends WsEvent<"authenticated", {
        user: {
            id: string;
            username: string;
            [key: string]: unknown;
        };
    }> { }
