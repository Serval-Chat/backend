import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '@/utils/logger';

@Injectable()
export class RegistrationInviteService {
    private readonly DATA_DIR = path.join(process.cwd(), '.data');
    private readonly TOKENS_FILE = path.join(this.DATA_DIR, 'tokens.txt');

    public constructor() {
        if (!fs.existsSync(this.DATA_DIR)) {
            fs.mkdirSync(this.DATA_DIR, { recursive: true });
        }
    }

    public listTokens(): string[] {
        try {
            if (!fs.existsSync(this.TOKENS_FILE)) {
                return [];
            }
            const file = fs.readFileSync(this.TOKENS_FILE, 'utf-8');
            return file
                .split(/\r?\n/)
                .map((t) => t.trim())
                .filter(Boolean);
        } catch (error) {
            logger.error('Failed to read tokens file:', error);
            throw new Error('Failed to read tokens');
        }
    }

    public createToken(): string {
        const token = crypto.randomBytes(16).toString('hex');
        const tokens = this.listTokens();

        if (tokens.includes(token)) {
            return this.createToken(); // Retry on collision
        }

        tokens.push(token);
        this.writeTokens(tokens);
        return token;
    }

    public deleteToken(tokenToDelete: string): boolean {
        const tokens = this.listTokens();

        if (!tokens.includes(tokenToDelete)) {
            return false;
        }

        const newTokens = tokens.filter((t) => t !== tokenToDelete);
        this.writeTokens(newTokens);
        return true;
    }

    public batchCreateTokens(count: number): string[] {
        const existingTokens = this.listTokens();
        const newTokens: string[] = [];

        while (newTokens.length < count) {
            const token = crypto.randomBytes(16).toString('hex');
            if (!existingTokens.includes(token) && !newTokens.includes(token)) {
                newTokens.push(token);
            }
        }

        const allTokens = [...existingTokens, ...newTokens];
        this.writeTokens(allTokens);
        return newTokens;
    }

    public getTokensFilePath(): string {
        return this.TOKENS_FILE;
    }

    private writeTokens(tokens: string[]): void {
        try {
            fs.writeFileSync(this.TOKENS_FILE, tokens.join('\n'));
        } catch (error) {
            logger.error('Failed to write tokens file:', error);
            throw new Error('Failed to write tokens');
        }
    }
}
