"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaRouter = void 0;
const express_1 = require("express");
const config_1 = require("../config");
const createMetaRouter = (config, transportStatus) => {
    const router = (0, express_1.Router)();
    router.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            mode: config.ha.mode,
            readTransport: transportStatus?.readTransport ?? 'unknown',
            timestamp: new Date().toISOString(),
        });
    });
    router.get('/config', (_req, res) => {
        res.json({
            port: config.port,
            mode: config.ha.mode,
            readTransport: transportStatus?.readTransport ?? 'unknown',
            writeTransport: transportStatus?.writeTransport ?? 'rest',
            transportStatus: transportStatus
                ? {
                    websocket: transportStatus.wsAvailable ? 'available' : 'unavailable',
                    rest: transportStatus.restAvailable ? 'available' : 'unavailable',
                }
                : undefined,
            ha: (0, config_1.redactedHaConfig)(config.ha),
        });
    });
    return router;
};
exports.createMetaRouter = createMetaRouter;
