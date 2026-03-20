"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadTransport = createReadTransport;
exports.createWsTransport = createWsTransport;
exports.createRestTransport = createRestTransport;
const logger_1 = require("../logger");
const wsReadTransport_1 = require("./wsReadTransport");
const restReadTransport_1 = require("./restReadTransport");
/**
 * Creates the appropriate read transport based on availability.
 *
 * Attempts WebSocket first (preferred for real-time updates),
 * falls back to REST if WebSocket fails.
 *
 * @param config - Configuration with baseUrl and token
 * @param options - Factory options (timeouts, preferences)
 * @returns The created transport and availability info
 */
async function createReadTransport(config, options = {}) {
    const { wsConnectionTimeout = 5000, preferWebSocket = true, restPollingInterval = 1000, } = options;
    let wsAvailable = false;
    let restAvailable = false;
    let transport;
    // Check for forced REST mode (useful for testing)
    const forceRest = process.env.FORCE_REST_TRANSPORT === 'true';
    if (forceRest) {
        logger_1.logger.info('TransportFactory: FORCE_REST_TRANSPORT=true, skipping WebSocket');
    }
    // Try WebSocket first if preferred (and not forced to REST)
    if (preferWebSocket && !forceRest) {
        logger_1.logger.info('TransportFactory: Attempting WebSocket connection...');
        const wsTransport = new wsReadTransport_1.WsReadTransport(config);
        try {
            // Race between connection and timeout
            await Promise.race([
                wsTransport.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('WebSocket connection timeout')), wsConnectionTimeout)),
            ]);
            wsAvailable = true;
            transport = wsTransport;
            logger_1.logger.info('TransportFactory: WebSocket connection successful');
            // Still check if REST is available (for status reporting)
            restAvailable = await testRestConnection(config);
            return {
                transport,
                activeTransport: 'websocket',
                wsAvailable,
                restAvailable,
            };
        }
        catch (err) {
            logger_1.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'TransportFactory: WebSocket connection failed, trying REST fallback');
            wsTransport.disconnect();
        }
    }
    // Fall back to REST
    logger_1.logger.info('TransportFactory: Attempting REST connection...');
    const restTransport = new restReadTransport_1.RestReadTransport(config, restPollingInterval);
    try {
        await restTransport.connect();
        restAvailable = true;
        transport = restTransport;
        logger_1.logger.info({ pollingInterval: restPollingInterval }, 'TransportFactory: REST connection successful (polling mode)');
        return {
            transport,
            activeTransport: 'rest',
            wsAvailable,
            restAvailable,
        };
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'TransportFactory: REST connection also failed');
        throw new Error('Failed to connect to Home Assistant via WebSocket or REST');
    }
}
/**
 * Test if REST API is reachable
 */
async function testRestConnection(config) {
    try {
        let baseUrl = config.baseUrl.replace(/\/+$/, '');
        if (!baseUrl.endsWith('/api')) {
            baseUrl = baseUrl + '/api';
        }
        const res = await fetch(`${baseUrl}/`, {
            headers: {
                Authorization: `Bearer ${config.token}`,
            },
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Create a WebSocket-only transport (no fallback).
 * Useful when you specifically need WebSocket features.
 */
function createWsTransport(config) {
    return new wsReadTransport_1.WsReadTransport(config);
}
/**
 * Create a REST-only transport (no WebSocket).
 * Useful for testing or when WebSocket is known to be unavailable.
 */
function createRestTransport(config, pollingInterval = 1000) {
    return new restReadTransport_1.RestReadTransport(config, pollingInterval);
}
