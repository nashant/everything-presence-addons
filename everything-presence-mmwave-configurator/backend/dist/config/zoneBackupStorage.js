"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zoneBackupStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
const DATA_DIR = process.env.DATA_DIR ?? '/config/everything-presence-zone-configurator';
const BACKUPS_FILE = path_1.default.join(DATA_DIR, 'zone-backups.json');
const ensureDataDir = () => {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
};
const readBackups = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(BACKUPS_FILE)) {
        return [];
    }
    try {
        const raw = fs_1.default.readFileSync(BACKUPS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read zone backups; returning empty');
        return [];
    }
};
const writeBackups = (backups) => {
    ensureDataDir();
    fs_1.default.writeFileSync(BACKUPS_FILE, JSON.stringify(backups, null, 2));
};
exports.zoneBackupStorage = {
    listBackups: () => readBackups(),
    getBackup: (id) => readBackups().find((backup) => backup.id === id),
    saveBackup: (backup) => {
        const backups = readBackups();
        const index = backups.findIndex((entry) => entry.id === backup.id);
        if (index >= 0) {
            backups[index] = backup;
        }
        else {
            backups.push(backup);
        }
        writeBackups(backups);
        return backup;
    },
    saveBackups: (incoming) => {
        const backups = readBackups();
        const byId = new Map(backups.map((backup) => [backup.id, backup]));
        for (const backup of incoming) {
            byId.set(backup.id, backup);
        }
        const merged = Array.from(byId.values());
        writeBackups(merged);
        return incoming;
    },
    deleteBackup: (id) => {
        const backups = readBackups();
        const next = backups.filter((entry) => entry.id !== id);
        if (next.length === backups.length) {
            return false;
        }
        writeBackups(next);
        return true;
    },
};
