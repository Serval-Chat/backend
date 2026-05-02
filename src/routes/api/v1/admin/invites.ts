import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '@/routes/api/v1/admin/middlewares/requireAdmin';
import logger from '@/utils/logger';

const router = express.Router();

const TOKENS_FILE = path.join('tokens.txt');

// Helper to read tokens
const readTokens = (): string[] => {
    try {
        if (!fs.existsSync(TOKENS_FILE)) {
            return [];
        }
        const file = fs.readFileSync(TOKENS_FILE, 'utf-8');
        return file
            .split(/\r?\n/)
            .map((t) => t.trim())
            .filter(Boolean);
    } catch (error) {
        logger.error('Failed to read tokens file:', error);
        throw new Error('Failed to read tokens');
    }
};

// Helper to write tokens
const writeTokens = (tokens: string[]) => {
    try {
        fs.writeFileSync(TOKENS_FILE, tokens.join('\n'));
    } catch (error) {
        logger.error('Failed to write tokens file:', error);
        throw new Error('Failed to write tokens');
    }
};

/**
 * Lists all active invite tokens.
 */
router.get('/', requireAdmin('manageInvites'), async (req, res) => {
    try {
        const tokens = readTokens();
        res.json(tokens);
    } catch (error) {
        logger.error('Failed to list invites:', error);
        res.status(500).json({ error: 'Failed to list invites' });
    }
});

/**
 * Generates a new random invite token.
 */
router.post('/', requireAdmin('manageInvites'), async (req, res) => {
    try {
        const token = crypto.randomBytes(16).toString('hex');
        const tokens = readTokens();

        if (tokens.includes(token)) {
            // This is highly unlikely with randomBytes, but good practice
            return res
                .status(400)
                .json({ error: 'Token already exists (collision detected)' });
        }

        tokens.push(token);
        writeTokens(tokens);

        res.json({ message: 'Invite created', token });
    } catch (error) {
        logger.error('Failed to create invite:', error);
        res.status(500).json({ error: 'Failed to create invite' });
    }
});

/**
 * Deletes a specific invite token.
 */
router.delete('/:token', requireAdmin('manageInvites'), async (req, res) => {
    try {
        const tokenToDelete = req.params.token;
        if (tokenToDelete === undefined || tokenToDelete === '') {
            return res.status(400).json({ error: 'Token is required' });
        }
        const tokens = readTokens();

        if (!tokens.includes(tokenToDelete)) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const newTokens = tokens.filter((t) => t !== tokenToDelete);
        writeTokens(newTokens);

        res.json({ message: 'Invite deleted' });
    } catch (error) {
        logger.error('Failed to delete invite:', error);
        res.status(500).json({ error: 'Failed to delete invite' });
    }
});

/**
 * Batch generates new random invite tokens.
 */
router.post('/batch', requireAdmin('manageInvites'), async (req, res) => {
    try {
        const { count } = req.body;
        const numCount = Number(count);

        if (isNaN(numCount) || numCount <= 0 || numCount > 1000) {
            return res.status(400).json({
                error: 'Count must be a number between 1 and 1000',
            });
        }

        const existingTokens = readTokens();
        const newTokens: string[] = [];

        while (newTokens.length < numCount) {
            const token = crypto.randomBytes(16).toString('hex');
            if (!existingTokens.includes(token) && !newTokens.includes(token)) {
                newTokens.push(token);
            }
        }

        const allTokens = [...existingTokens, ...newTokens];
        writeTokens(allTokens);

        res.json({
            message: `${numCount} invites created`,
            tokens: newTokens,
        });
    } catch (error) {
        logger.error('Failed to batch create invites:', error);
        res.status(500).json({ error: 'Failed to batch create invites' });
    }
});

/**
 * Exports all active invite tokens as a file.
 */
router.get('/export', requireAdmin('manageInvites'), async (req, res) => {
    try {
        if (!fs.existsSync(TOKENS_FILE)) {
            return res.status(404).json({ error: 'No tokens found' });
        }

        res.download(TOKENS_FILE, 'invites.txt');
    } catch (error) {
        logger.error('Failed to export invites:', error);
        res.status(500).json({ error: 'Failed to export invites' });
    }
});

export default router;

/*
 * Yes I know this is quite archaic but I am too lazy to rewrite it rn
 */
