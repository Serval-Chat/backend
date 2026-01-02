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
        const tokens = await readTokens();
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
        const tokens = await readTokens();

        if (tokens.includes(token)) {
            // This is highly unlikely with randomBytes, but good practice
            return res
                .status(400)
                .json({ error: 'Token already exists (collision detected)' });
        }

        tokens.push(token);
        await writeTokens(tokens);

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
        if (!tokenToDelete) {
            return res.status(400).json({ error: 'Token is required' });
        }
        const tokens = await readTokens();

        if (!tokens.includes(tokenToDelete)) {
            return res.status(404).json({ error: 'Token not found' });
        }

        const newTokens = tokens.filter((t) => t !== tokenToDelete);
        await writeTokens(newTokens);

        res.json({ message: 'Invite deleted' });
    } catch (error) {
        logger.error('Failed to delete invite:', error);
        res.status(500).json({ error: 'Failed to delete invite' });
    }
});

export default router;
