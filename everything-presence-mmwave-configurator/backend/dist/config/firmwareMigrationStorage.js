"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firmwareMigrationStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
const DATA_DIR = process.env.DATA_DIR ?? '/config/everything-presence-zone-configurator';
const MIGRATION_FILE = path_1.default.join(DATA_DIR, 'firmware-migrations.json');
const ensureDataDir = () => {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
};
const readFile = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(MIGRATION_FILE)) {
        return { version: 1, byDeviceId: {}, activeDeviceId: null };
    }
    try {
        const raw = fs_1.default.readFileSync(MIGRATION_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && parsed.byDeviceId && typeof parsed.byDeviceId === 'object') {
            return {
                version: 1,
                byDeviceId: parsed.byDeviceId,
                activeDeviceId: typeof parsed.activeDeviceId === 'string' ? parsed.activeDeviceId : null,
            };
        }
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read firmware migration state; returning empty');
    }
    return { version: 1, byDeviceId: {}, activeDeviceId: null };
};
const writeFile = (data) => {
    ensureDataDir();
    fs_1.default.writeFileSync(MIGRATION_FILE, JSON.stringify(data, null, 2));
};
const isActivePhase = (phase) => ['backing_up', 'installing', 'resync_wait', 'resyncing', 'restoring', 'verifying'].includes(phase);
exports.firmwareMigrationStorage = {
    get: (deviceId) => {
        const file = readFile();
        return file.byDeviceId[deviceId] ?? null;
    },
    getActive: () => {
        const file = readFile();
        const deviceId = file.activeDeviceId;
        if (!deviceId)
            return null;
        return file.byDeviceId[deviceId] ?? null;
    },
    upsert: (deviceId, patch) => {
        const file = readFile();
        const now = new Date().toISOString();
        const existing = file.byDeviceId[deviceId];
        const next = {
            deviceId,
            phase: patch.phase,
            backupId: typeof patch.backupId === 'string' ? patch.backupId : patch.backupId ?? existing?.backupId ?? null,
            preparedVersion: typeof patch.preparedVersion === 'string'
                ? patch.preparedVersion
                : patch.preparedVersion ?? existing?.preparedVersion ?? null,
            startedAt: existing?.startedAt ?? now,
            updatedAt: now,
            lastError: typeof patch.lastError === 'string' ? patch.lastError : patch.lastError ?? existing?.lastError ?? null,
        };
        file.byDeviceId[deviceId] = next;
        if (isActivePhase(next.phase)) {
            file.activeDeviceId = deviceId;
        }
        else if (file.activeDeviceId === deviceId) {
            file.activeDeviceId = null;
        }
        writeFile(file);
        return next;
    },
    clear: (deviceId) => {
        const file = readFile();
        delete file.byDeviceId[deviceId];
        if (file.activeDeviceId === deviceId) {
            file.activeDeviceId = null;
        }
        writeFile(file);
    },
};
