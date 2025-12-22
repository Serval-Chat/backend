import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * Resolves a path against the current working directory
 */
function ensureAbsolute(p: string): string {
    if (!p) return '';
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

const JWT_SECRET = process.env.JWT_SECRET || '';
const PORT = Number(process.env.CHAT_PORT || -1);
const MONGO_URI = process.env.MONGO_URI || '';
const PROJECT_LEVEL = process.env.PROJ_LEVEL || '';
const LOGS_PATH = ensureAbsolute(process.env.LOGS_PATH || '');
const PUBLIC_FOLDER_PATH = ensureAbsolute(process.env.PUBLIC_FOLDER || '');
const USE_HTTPS = process.env.HTTPS || '';
const CERTS_PATH = ensureAbsolute(process.env.CERTS_PATH || '');
const VAPID_PUB = process.env.VAPID_PUB || '';
const VAPID_PRI = process.env.VAPID_PRI || '';
const SERVER_URL = process.env.SERVER_URL || '';
const GRAFANA_USER = process.env.GRAFANA_USER || '';
const GRAFANA_PASSWORD = process.env.GRAFANA_PASSWORD || '';

if (PORT === -1) throw new Error('CHAT_PORT not set.');
if (!JWT_SECRET) throw new Error('JWT_SECRET not set.');
if (!MONGO_URI) throw new Error('MONGO_URI not set.');
if (!PROJECT_LEVEL) throw new Error('PROJ_LEVEL not set.');
if (!LOGS_PATH) throw new Error('LOGS_PATH not set.');
if (!PUBLIC_FOLDER_PATH) throw new Error('PUBLIC_FOLDER not set.');
if (!USE_HTTPS) throw new Error('HTTPS not set.');
if (!SERVER_URL) throw new Error('SERVER_URL not set.');

if (!['production', 'development'].includes(PROJECT_LEVEL)) {
    throw new Error(
        'Invalid PROJECT_LEVEL. Use "production" or "development".',
    );
}

if (!['on', 'off'].includes(USE_HTTPS)) {
    throw new Error('Invalid HTTPS. Use "on" or "off"');
}

try {
    if (!fs.existsSync(LOGS_PATH)) {
        fs.mkdirSync(LOGS_PATH, { recursive: true });
    }

    if (USE_HTTPS === 'on') {
        if (!CERTS_PATH) throw new Error('CERTS_PATH not set.');
        if (!fs.existsSync(CERTS_PATH)) {
            console.error(`Certificates folder doesn't exist at ${CERTS_PATH}`);
            process.exit(1);
        }
    }
} catch (err: any) {
    throw new Error('Failed to create logs folder: ' + err.message);
}

if (!fs.existsSync(PUBLIC_FOLDER_PATH)) {
    throw new Error(`Public folder not found at ${PUBLIC_FOLDER_PATH}`);
}

export {
    JWT_SECRET,
    PORT,
    MONGO_URI,
    PROJECT_LEVEL,
    LOGS_PATH,
    PUBLIC_FOLDER_PATH,
    USE_HTTPS,
    CERTS_PATH,
    VAPID_PRI,
    VAPID_PUB,
    SERVER_URL,
    GRAFANA_USER,
    GRAFANA_PASSWORD,
};
