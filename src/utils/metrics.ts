import {
    Registry,
    Counter,
    Gauge,
    Histogram,
    collectDefaultMetrics,
} from 'prom-client';

// Prometheus metrics registry
// Collects and exposes application metrics for monitoring
export const register = new Registry();

collectDefaultMetrics({ register });

// Application metrics for Serchat

// Counter for total messages sent
export const messagesSentCounter = new Counter({
    name: 'chat_messages_sent_total',
    help: 'Total number of messages sent',
    labelNames: ['type'], // Type can be 'direct', 'group', etc.
    registers: [register],
});

// Counter for total users created
export const usersCreatedCounter = new Counter({
    name: 'chat_users_created_total',
    help: 'Total number of users created',
    registers: [register],
});

// Gauge for currently online users
export const onlineUsersGauge = new Gauge({
    name: 'chat_online_users',
    help: 'Number of currently online users',
    registers: [register],
});

// Counter for login attempts
export const loginAttemptsCounter = new Counter({
    name: 'chat_login_attempts_total',
    help: 'Total number of login attempts',
    labelNames: ['status'], // Status can be 'success' or 'failure'
    registers: [register],
});

// Counter for registration attempts
export const registrationAttemptsCounter = new Counter({
    name: 'chat_registration_attempts_total',
    help: 'Total number of registration attempts',
    labelNames: ['status'], // Status can be 'success' or 'failure'
    registers: [register],
});

// Counter for friend requests
export const friendRequestsCounter = new Counter({
    name: 'chat_friend_requests_total',
    help: 'Total number of friend requests',
    labelNames: ['action'], // Action can be 'sent', 'accepted', 'rejected'
    registers: [register],
});

// Histogram for message processing time
export const messageProcessingHistogram = new Histogram({
    name: 'chat_message_processing_duration_seconds',
    help: 'Duration of message processing in seconds',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register],
});

// HTTP request metrics
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
});

export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

// WebSocket connection metrics
export const websocketConnectionsGauge = new Gauge({
    name: 'websocket_connections_active',
    help: 'Number of active WebSocket connections',
    registers: [register],
});

export const websocketMessagesCounter = new Counter({
    name: 'websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['event', 'direction'], // Direction can be 'inbound' or 'outbound'
    registers: [register],
});

// Database query metrics
export const dbQueriesCounter = new Counter({
    name: 'db_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'collection'],
    registers: [register],
});

export const dbQueryDuration = new Histogram({
    name: 'db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['operation', 'collection'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
});

// Gauge for total users in database
export const totalUsersGauge = new Gauge({
    name: 'chat_total_users',
    help: 'Total number of users in the database',
    registers: [register],
});

// Gauge for total messages in database
export const totalMessagesGauge = new Gauge({
    name: 'chat_total_messages',
    help: 'Total number of messages in the database',
    registers: [register],
});
