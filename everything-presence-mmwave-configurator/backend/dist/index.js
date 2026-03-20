"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const server_1 = require("./server");
const writeClient_1 = require("./ha/writeClient");
const transportFactory_1 = require("./ha/transportFactory");
const deviceProfiles_1 = require("./domain/deviceProfiles");
const liveWs_1 = require("./routes/liveWs");
const lanFirmwareServer_1 = require("./lanFirmwareServer");
const start = async () => {
    try {
        const config = (0, config_1.loadConfig)();
        logger_1.logger.info('Initializing Home Assistant clients...');
        // 1. Initialize Write Client (always REST, always available)
        logger_1.logger.info('Initializing REST write client...');
        const writeClient = new writeClient_1.HaWriteClient(config.ha);
        logger_1.logger.info('REST write client ready');
        // 2. Initialize Read Transport (WS preferred, REST fallback)
        logger_1.logger.info('Initializing read transport (WebSocket preferred)...');
        let transportResult;
        try {
            transportResult = await (0, transportFactory_1.createReadTransport)({
                baseUrl: config.ha.baseUrl,
                token: config.ha.token,
                mode: config.ha.mode,
            }, {
                wsConnectionTimeout: 5000,
                preferWebSocket: true,
                restPollingInterval: 1000,
            });
        }
        catch (err) {
            logger_1.logger.error({ err }, 'Failed to initialize read transport - no HA connectivity');
            throw err;
        }
        const { transport: readTransport, activeTransport, wsAvailable, restAvailable } = transportResult;
        // Log transport status
        if (activeTransport === 'websocket') {
            logger_1.logger.info('Read transport: WebSocket (real-time updates)');
        }
        else {
            logger_1.logger.info({ pollingInterval: 1000 }, 'Read transport: REST (polling mode)');
        }
        logger_1.logger.info({ readTransport: activeTransport, writeTransport: 'rest', wsAvailable, restAvailable }, 'Transport status');
        // 3. Initialize profile loader
        const profileLoader = new deviceProfiles_1.DeviceProfileLoader(path_1.default.resolve(__dirname, '../config/device-profiles'), path_1.default.resolve(process.cwd(), 'config/device-profiles'));
        // Build transport status for API exposure
        const transportStatus = {
            readTransport: activeTransport,
            writeTransport: 'rest',
            wsAvailable,
            restAvailable,
        };
        // 4. Create Express app with dependencies
        const app = (0, server_1.createServer)(config, {
            readTransport,
            writeClient,
            profileLoader,
            transportStatus,
        });
        // 5. Create HTTP server
        const httpServer = http_1.default.createServer(app);
        // 6. Attach WebSocket server for live tracking (frontend connections)
        (0, liveWs_1.createLiveWebSocketServer)(httpServer, readTransport, profileLoader);
        // 7. Start LAN Firmware Server (separate port for device firmware downloads)
        (0, lanFirmwareServer_1.createLanFirmwareServer)(config.firmware.lanPort);
        // 8. Start main server listening
        httpServer.listen(config.port, () => {
            logger_1.logger.info({
                port: config.port,
                firmwareLanPort: config.firmware.lanPort,
                ha: (0, config_1.redactedHaConfig)(config.ha),
                readTransport: activeTransport,
                writeTransport: 'rest',
            }, 'Zone Configurator backend started');
        });
    }
    catch (error) {
        logger_1.logger.error({ error, message: error.message, stack: error.stack }, 'Failed to start backend');
        process.exit(1);
    }
};
start();
