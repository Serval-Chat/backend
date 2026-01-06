/**
 * An envelope for WebSocket messages.
 * Must be used for client -> server interactions.
 */

import { type IWsPingMessageEvent, type IWsPingResponseEvent } from "./events/ping";
import { type IWsAuthenticateEvent, type IWsAuthenticatedEvent } from "./events/auth";
import { type IWsErrorEvent } from "./error";

export type AnyMessageWsEvent =
    | IWsPingMessageEvent
    | IWsAuthenticateEvent;

export type AnyResponseWsEvent =
    | IWsPingResponseEvent
    | IWsAuthenticatedEvent
    | IWsErrorEvent;

export interface IWsEnvelope {
    /**
     * Unique ID for messages, used for deduping and acking.
     */
    id: string;

    // Event type and data
    event: AnyMessageWsEvent | AnyResponseWsEvent;

    /**
     * Message metadata for ACKing and timestamping.
     */
    meta: {
        replyTo: string; // for acking
        ts: number; // timestamp
    }
}