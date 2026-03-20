"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactedHaConfig = exports.loadConfig = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
const DEFAULT_PORT = 42069;
const DEFAULT_FIRMWARE_LAN_PORT = 38080;
const DEFAULT_MAX_VERSIONS_PER_DEVICE = 3;
const DEFAULT_FRONTEND_DIST = path_1.default.resolve(__dirname, '../../frontend/dist');
const DEFAULT_DATA_DIR = '/config/everything-presence-zone-configurator';
const DEFAULT_FIRMWARE_CACHE_DIR = path_1.default.join(process.env.DATA_DIR ?? DEFAULT_DATA_DIR, 'fw_cache');
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
/**
 * Normalize the base URL to ensure it ends with /api
 * Accepts: http://host:8123, http://host:8123/, http://host:8123/api, http://host:8123/api/
 * Returns: http://host:8123/api
 */
const normalizeBaseUrl = (url) => {
    let normalized = trimTrailingSlash(url);
    if (!normalized.endsWith('/api')) {
        normalized = `${normalized}/api`;
    }
    return normalized;
};
const parsePort = (value) => {
    if (!value) {
        return DEFAULT_PORT;
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
        return DEFAULT_PORT;
    }
    return parsed;
};
const detectHaConfig = () => {
    const supervisorToken = process.env.SUPERVISOR_TOKEN;
    const supervisorApiUrl = process.env.SUPERVISOR_API ?? 'http://supervisor';
    if (supervisorToken) {
        return {
            mode: 'supervisor',
            baseUrl: normalizeBaseUrl(process.env.HA_BASE_URL ?? 'http://supervisor/core/api'),
            token: supervisorToken,
            supervisorApiUrl: trimTrailingSlash(supervisorApiUrl),
        };
    }
    const standaloneUrl = process.env.HA_BASE_URL;
    const tokenFromEnv = process.env.HA_LONG_LIVED_TOKEN;
    const tokenFilePath = process.env.HA_LONG_LIVED_TOKEN_FILE;
    let standaloneToken = tokenFromEnv;
    if (tokenFilePath) {
        try {
            standaloneToken = fs_1.default.readFileSync(tokenFilePath, 'utf8').trim();
        }
        catch (err) {
            throw new Error(`Failed to read HA_LONG_LIVED_TOKEN_FILE at "${tokenFilePath}": ${err.message}`);
        }
    }
    if (standaloneUrl && standaloneToken) {
        return {
            mode: 'standalone',
            baseUrl: normalizeBaseUrl(standaloneUrl),
            token: standaloneToken,
        };
    }
    throw new Error('Home Assistant credentials are not configured. Provide SUPERVISOR_TOKEN (add-on) or HA_BASE_URL and HA_LONG_LIVED_TOKEN/HA_LONG_LIVED_TOKEN_FILE (standalone).');
};
const loadFirmwareConfig = () => {
    return {
        lanPort: parsePort(process.env.FIRMWARE_LAN_PORT) || DEFAULT_FIRMWARE_LAN_PORT,
        lanIpOverride: process.env.FIRMWARE_LAN_IP || undefined,
        cacheDir: process.env.FIRMWARE_CACHE_DIR ?? DEFAULT_FIRMWARE_CACHE_DIR,
        maxVersionsPerDevice: Number(process.env.FIRMWARE_MAX_VERSIONS) || DEFAULT_MAX_VERSIONS_PER_DEVICE,
    };
};
const loadConfig = () => {
    const ha = detectHaConfig();
    return {
        port: parsePort(process.env.PORT),
        ha,
        frontendDist: process.env.FRONTEND_DIST
            ? path_1.default.resolve(process.env.FRONTEND_DIST)
            : DEFAULT_FRONTEND_DIST,
        firmware: loadFirmwareConfig(),
    };
};
exports.loadConfig = loadConfig;
const redactedHaConfig = (ha) => ({
    ...ha,
    token: '***redacted***',
});
exports.redactedHaConfig = redactedHaConfig;
