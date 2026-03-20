"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./logger");
const meta_1 = require("./routes/meta");
const devices_1 = require("./routes/devices");
const entityDiscovery_1 = require("./routes/entityDiscovery");
const rooms_1 = require("./routes/rooms");
const zones_1 = require("./routes/zones");
const settings_1 = require("./routes/settings");
const live_1 = require("./routes/live");
const customAssets_1 = require("./routes/customAssets");
const heatmap_1 = require("./routes/heatmap");
const deviceMappings_1 = require("./routes/deviceMappings");
const firmware_1 = require("./routes/firmware");
const zoneBackups_1 = require("./routes/zoneBackups");
const deviceEntityService_1 = require("./domain/deviceEntityService");
const migrationService_1 = require("./domain/migrationService");
const createServer = (config, deps) => {
    const app = (0, express_1.default)();
    app.use((0, pino_http_1.default)({
        logger: logger_1.logger,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
    }));
    app.use(express_1.default.json());
    app.use('/api/meta', (0, meta_1.createMetaRouter)(config, deps?.transportStatus));
    app.use('/api/rooms', (0, rooms_1.createRoomsRouter)());
    app.use('/api/zones', (0, zones_1.createZonesRouter)());
    app.use('/api/settings', (0, settings_1.createSettingsRouter)());
    app.use('/api/custom-assets', (0, customAssets_1.createCustomAssetsRouter)());
    app.use('/api/device-mappings', (0, deviceMappings_1.createDeviceMappingsRouter)({ readTransport: deps?.readTransport, profileLoader: deps?.profileLoader }));
    // Routes that require HA dependencies
    if (deps) {
        // Initialize deviceEntityService with profileLoader
        deviceEntityService_1.deviceEntityService.setProfileLoader(deps.profileLoader);
        // Run migration on startup (async, non-blocking)
        migrationService_1.migrationService.migrateAllOnStartup().catch((error) => {
            logger_1.logger.error({ error }, 'Entity mapping migration failed on startup');
        });
        const devicesDeps = {
            readTransport: deps.readTransport,
            writeClient: deps.writeClient,
            profileLoader: deps.profileLoader,
        };
        app.use('/api/devices', (0, devices_1.createDevicesRouter)(devicesDeps));
        app.use('/api/devices', (0, entityDiscovery_1.createEntityDiscoveryRouter)({
            readTransport: deps.readTransport,
            profileLoader: deps.profileLoader,
        }));
        app.use('/api/devices', (0, heatmap_1.createHeatmapRouter)({
            haConfig: config.ha,
            readTransport: deps.readTransport,
            profileLoader: deps.profileLoader,
        }));
        app.use('/api/live', (0, live_1.createLiveRouter)(deps.readTransport, deps.writeClient, deps.profileLoader));
        // Firmware update routes
        app.use('/api/firmware', (0, firmware_1.createFirmwareRouter)({
            config: config.firmware,
            writeClient: deps.writeClient,
            readTransport: deps.readTransport,
        }));
        // Zone backup and restore routes
        app.use('/api/zone-backups', (0, zoneBackups_1.createZoneBackupsRouter)({
            readTransport: deps.readTransport,
            writeClient: deps.writeClient,
            profileLoader: deps.profileLoader,
        }));
    }
    app.use('/api/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    if (config.frontendDist && fs_1.default.existsSync(config.frontendDist)) {
        const indexHtml = path_1.default.join(config.frontendDist, 'index.html');
        app.use(express_1.default.static(config.frontendDist));
        app.get('*', (_req, res) => {
            res.sendFile(indexHtml);
        });
        logger_1.logger.info({ frontendDist: config.frontendDist }, 'Serving frontend assets');
    }
    else {
        logger_1.logger.warn({ frontendDist: config.frontendDist }, 'Frontend assets not found; UI will not be served by backend');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err, _req, res, _next) => {
        logger_1.logger.error({ err }, 'Unhandled error');
        res.status(500).json({ message: 'Internal server error' });
    });
    return app;
};
exports.createServer = createServer;
