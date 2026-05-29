export interface FetchResult {
    url: string;
    size: number;
    contentType: string;
    mimeType: string;
    title?: string;
    description?: string;
    image?: string;
    video?: string;
    embedVideoUrl?: string;
    authorName?: string;
    authorUrl?: string;
    providerName?: string;
    providerUrl?: string;
    themeColor?: string;
}

export interface TextFetchResult {
    ok: true;
    url: string;
    size: number;
    contentType: string;
    body: string;
}

export interface FetchFailure {
    ok: false;
    url: string;
    reason: string;
}

export interface IWsEvent<TType extends string = string, TPayload = unknown> {
    type: TType;
    payload: TPayload;
}

export interface IWsEnvelope<TEvent extends IWsEvent = IWsEvent> {
    id: string;
    event: TEvent;
    meta?: {
        replyTo?: string;
        ts?: number;
    };
}

export interface ScrapePayload {
    url: string;
}

export interface FetchTextPayload {
    url: string;
}

export type ScrapeEvent = IWsEvent<'scrape', ScrapePayload>;
export type FetchTextEvent = IWsEvent<'fetchText', FetchTextPayload>;
export type PingEvent = IWsEvent<'ping', null>;
export type PongEvent = IWsEvent<'pong', null>;
export type ScraperSuccessResult = FetchResult | TextFetchResult | FetchFailure;
export type JobSuccessEvent = IWsEvent<'JobSuccess', ScraperSuccessResult>;
export type JobFailureEvent = IWsEvent<'JobFailure', { reason: string }>;

export type IncomingWsEvent = ScrapeEvent | FetchTextEvent | PingEvent;
export type OutgoingWsEvent = JobSuccessEvent | JobFailureEvent | PongEvent;
