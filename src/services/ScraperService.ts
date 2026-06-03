import { OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { injectable } from 'inversify';
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { SCRAPER_HOST, SCRAPER_PORT } from '@/config/env';
import {
    FetchResult,
    TextFetchResult,
    FetchFailure,
    IWsEnvelope,
    OutgoingWsEvent,
    ScrapeEvent,
    FetchTextEvent,
    ScraperSuccessResult,
} from '@/types/scraper';

@injectable()
export class ScraperService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ScraperService.name);
    private ws: WebSocket | null = null;
    private readonly url: string;

    private isConnected: boolean = false;
    private intentionallyClosed: boolean = false;

    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private readonly shouldAutoConnect: boolean =
        process.env.NODE_ENV !== 'test' ||
        process.env.SCRAPER_CONNECT_IN_TEST === 'true';

    private readonly pendingRequests = new Map<
        string,
        {
            resolve: (value: ScraperSuccessResult) => void;
            reject: (reason?: unknown) => void;
        }
    >();

    public constructor() {
        this.url = `ws://${SCRAPER_HOST}:${SCRAPER_PORT}`;
        if (this.shouldAutoConnect) {
            this.connect();
        }
    }

    public onModuleInit() {
        if (!this.shouldAutoConnect) return;
        this.logger.log(`Starting ScraperService connection to ${this.url}...`);
        this.connect();
    }

    public onModuleDestroy() {
        this.logger.log('Stopping ScraperService connection...');
        this.disconnect();
    }

    private connect(): void {
        this.intentionallyClosed = false;
        if (this.ws) return;

        this.logger.log(`Connecting to scraper at ${this.url}`);
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
            this.logger.log('Connected to scraper service');
            this.isConnected = true;
            this.startPing();
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', () => {
            this.logger.log('Disconnected from scraper service');
            this.isConnected = false;
            this.ws = null;
            this.stopPing();

            this.rejectAllPending(new Error('Connection closed'));

            if (!this.intentionallyClosed) {
                this.scheduleReconnect();
            }
        });

        this.ws.on('error', (err: Error) => {
            this.logger.error('WebSocket error', err.stack);
        });
    }

    private disconnect(): void {
        this.intentionallyClosed = true;
        this.stopPing();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.rejectAllPending(new Error('Client disconnected intentionally'));
    }

    public async scrape(url: string): Promise<FetchResult> {
        return this.sendJob<ScrapeEvent, FetchResult>({
            type: 'scrape',
            payload: { url },
        });
    }

    public async fetchText(
        url: string,
    ): Promise<TextFetchResult | FetchFailure> {
        return this.sendJob<FetchTextEvent, TextFetchResult | FetchFailure>({
            type: 'fetchText',
            payload: { url },
        });
    }

    private async sendJob<TEvent extends ScrapeEvent | FetchTextEvent, TResult>(
        event: TEvent,
    ): Promise<TResult> {
        if (!this.isConnected || !this.ws) {
            throw new Error('Not connected to scraper service');
        }

        const id = crypto.randomUUID();
        const envelope: IWsEnvelope<TEvent> = { id, event };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, {
                resolve: (value) => resolve(value as TResult),
                reject,
            });

            try {
                if (this.ws) {
                    this.ws.send(JSON.stringify(envelope));
                }
            } catch (err) {
                this.pendingRequests.delete(id);
                reject(err);
            }
        });
    }

    private handleMessage(data: WebSocket.Data): void {
        let envelope: IWsEnvelope<OutgoingWsEvent>;
        try {
            const raw = Buffer.isBuffer(data) ? data.toString() : String(data);
            envelope = JSON.parse(raw) as IWsEnvelope<OutgoingWsEvent>;
        } catch (err: unknown) {
            this.logger.error(
                'Failed to parse incoming message',
                (err as Error).stack,
            );
            return;
        }

        if (envelope.event.type === 'pong') {
            return;
        }

        const replyTo = envelope.meta?.replyTo;
        if (replyTo === undefined) {
            this.logger.warn(
                `Received message without replyTo: ${JSON.stringify(envelope)}`,
            );
            return;
        }

        const pending = this.pendingRequests.get(replyTo);
        if (!pending) {
            return;
        }

        this.pendingRequests.delete(replyTo);

        if (envelope.event.type === 'JobSuccess') {
            this.logger.debug(
                `Scraper job success for id ${replyTo}: ${JSON.stringify(envelope.event.payload)}`,
            );
            pending.resolve(envelope.event.payload);
        } else {
            pending.reject(new Error(envelope.event.payload.reason));
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.logger.log('Reconnecting in 5000ms...');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, 5000);
        this.reconnectTimer.unref();
    }

    private startPing(): void {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.isConnected && this.ws) {
                const envelope: IWsEnvelope = {
                    id: crypto.randomUUID(),
                    event: { type: 'ping', payload: null },
                };
                this.ws.send(JSON.stringify(envelope));
            }
        }, 30000);
        this.pingTimer.unref();
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private rejectAllPending(error: Error): void {
        for (const pending of this.pendingRequests.values()) {
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }
}
