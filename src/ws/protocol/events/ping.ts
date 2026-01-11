import type { WsEvent } from '@/ws/protocol/event';

export interface IWsPingMessageEvent extends WsEvent<'ping', {}> {}

export interface IWsPingResponseEvent extends WsEvent<'pong', {}> {}
