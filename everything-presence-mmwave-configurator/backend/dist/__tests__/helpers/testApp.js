"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestApp = createTestApp;
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const server_1 = require("../../server");
const liveWs_1 = require("../../routes/liveWs");
const deviceProfiles_1 = require("../../domain/deviceProfiles");
const mockReadTransport_1 = require("./mockReadTransport");
const mockWriteClient_1 = require("./mockWriteClient");
/**
 * Spin up an isolated Express + WebSocket test server with mock HA transports.
 *
 * Listens on a random port (port 0) so tests can run in parallel.
 */
async function createTestApp() {
    const readTransport = new mockReadTransport_1.MockReadTransport();
    const writeClient = new mockWriteClient_1.MockWriteClient();
    const profileDir = path_1.default.resolve(__dirname, "../../../../config/device-profiles");
    const profileLoader = new deviceProfiles_1.DeviceProfileLoader(profileDir);
    const haConfig = {
        mode: "standalone",
        baseUrl: "http://localhost:8123/api",
        token: "test-token",
    };
    const firmwareConfig = {
        lanPort: 0,
        cacheDir: process.env.DATA_DIR ?? "/tmp/ep-test-fw",
        maxVersionsPerDevice: 3,
    };
    const config = {
        port: 0,
        ha: haConfig,
        frontendDist: null,
        firmware: firmwareConfig,
    };
    const transportStatus = {
        readTransport: "websocket",
        writeTransport: "rest",
        wsAvailable: true,
        restAvailable: true,
    };
    const app = (0, server_1.createServer)(config, {
        readTransport,
        writeClient,
        profileLoader,
        transportStatus,
    });
    const server = http_1.default.createServer(app);
    (0, liveWs_1.createLiveWebSocketServer)(server, readTransport, profileLoader);
    // Listen on random port
    await new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    const close = () => new Promise((resolve, reject) => {
        readTransport.unsubscribeAll();
        server.close((err) => (err ? reject(err) : resolve()));
    });
    return { app, server, readTransport, writeClient, profileLoader, baseUrl, close };
}
