"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
// Use /config/everything-presence-zone-configurator for persistent storage across add-on reinstalls
// The /config directory is mapped to Home Assistant's config folder via config:rw in config.yaml
// Using /data would cause data loss on reinstall as it's container-internal storage
const DATA_DIR = process.env.DATA_DIR ?? '/config/everything-presence-zone-configurator';
const ROOMS_FILE = path_1.default.join(DATA_DIR, 'rooms.json');
const SETTINGS_FILE = path_1.default.join(DATA_DIR, 'settings.json');
const CUSTOM_FLOORS_FILE = path_1.default.join(DATA_DIR, 'custom-floors.json');
const CUSTOM_FURNITURE_FILE = path_1.default.join(DATA_DIR, 'custom-furniture.json');
const ensureDataDir = () => {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
};
const readRooms = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(ROOMS_FILE)) {
        return [];
    }
    try {
        const raw = fs_1.default.readFileSync(ROOMS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read rooms.json; returning empty');
        return [];
    }
};
const writeRooms = (rooms) => {
    ensureDataDir();
    fs_1.default.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
};
const readSettings = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(SETTINGS_FILE)) {
        return {
            wizardCompleted: false,
            wizardStep: 'device',
            outlineDone: false,
            placementDone: false,
            zonesReady: false,
            defaultRoomId: null,
        };
    }
    try {
        const raw = fs_1.default.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const rawDefaultRoom = parsed.defaultRoomId;
            return {
                wizardCompleted: Boolean(parsed.wizardCompleted),
                wizardStep: typeof parsed.wizardStep === 'string' ? parsed.wizardStep : 'device',
                outlineDone: Boolean(parsed.outlineDone),
                placementDone: Boolean(parsed.placementDone),
                zonesReady: Boolean(parsed.zonesReady),
                defaultRoomId: typeof rawDefaultRoom === 'string'
                    ? rawDefaultRoom
                    : rawDefaultRoom === null
                        ? null
                        : undefined,
            };
        }
        return {
            wizardCompleted: false,
            wizardStep: 'device',
            outlineDone: false,
            placementDone: false,
            zonesReady: false,
            defaultRoomId: null,
        };
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read settings.json; returning defaults');
        return {
            wizardCompleted: false,
            wizardStep: 'device',
            outlineDone: false,
            placementDone: false,
            zonesReady: false,
            defaultRoomId: null,
        };
    }
};
const writeSettings = (settings) => {
    ensureDataDir();
    fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
};
// Custom floor materials
const readCustomFloors = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(CUSTOM_FLOORS_FILE)) {
        return [];
    }
    try {
        const raw = fs_1.default.readFileSync(CUSTOM_FLOORS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read custom-floors.json; returning empty');
        return [];
    }
};
const writeCustomFloors = (floors) => {
    ensureDataDir();
    fs_1.default.writeFileSync(CUSTOM_FLOORS_FILE, JSON.stringify(floors, null, 2));
};
// Custom furniture types
const readCustomFurniture = () => {
    ensureDataDir();
    if (!fs_1.default.existsSync(CUSTOM_FURNITURE_FILE)) {
        return [];
    }
    try {
        const raw = fs_1.default.readFileSync(CUSTOM_FURNITURE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        logger_1.logger.warn({ error }, 'Failed to read custom-furniture.json; returning empty');
        return [];
    }
};
const writeCustomFurniture = (furniture) => {
    ensureDataDir();
    fs_1.default.writeFileSync(CUSTOM_FURNITURE_FILE, JSON.stringify(furniture, null, 2));
};
exports.storage = {
    // Rooms
    listRooms: () => readRooms(),
    getRoom: (id) => readRooms().find((r) => r.id === id),
    saveRoom: (room) => {
        const rooms = readRooms();
        const idx = rooms.findIndex((r) => r.id === room.id);
        if (idx >= 0) {
            rooms[idx] = room;
        }
        else {
            rooms.push(room);
        }
        writeRooms(rooms);
        return room;
    },
    deleteRoom: (id) => {
        const rooms = readRooms();
        const next = rooms.filter((r) => r.id !== id);
        if (next.length === rooms.length) {
            return false;
        }
        writeRooms(next);
        return true;
    },
    // Settings
    getSettings: () => readSettings(),
    saveSettings: (settings) => {
        const current = readSettings();
        const merged = { ...current, ...settings };
        writeSettings(merged);
        return merged;
    },
    // Custom floor materials
    listCustomFloors: () => readCustomFloors(),
    getCustomFloor: (id) => readCustomFloors().find((f) => f.id === id),
    saveCustomFloor: (floor) => {
        const floors = readCustomFloors();
        const idx = floors.findIndex((f) => f.id === floor.id);
        if (idx >= 0) {
            floors[idx] = floor;
        }
        else {
            floors.push(floor);
        }
        writeCustomFloors(floors);
        return floor;
    },
    deleteCustomFloor: (id) => {
        const floors = readCustomFloors();
        const next = floors.filter((f) => f.id !== id);
        if (next.length === floors.length) {
            return false;
        }
        writeCustomFloors(next);
        return true;
    },
    // Custom furniture types
    listCustomFurniture: () => readCustomFurniture(),
    getCustomFurniture: (id) => readCustomFurniture().find((f) => f.id === id),
    saveCustomFurniture: (furniture) => {
        const items = readCustomFurniture();
        const idx = items.findIndex((f) => f.id === furniture.id);
        if (idx >= 0) {
            items[idx] = furniture;
        }
        else {
            items.push(furniture);
        }
        writeCustomFurniture(items);
        return furniture;
    },
    deleteCustomFurniture: (id) => {
        const items = readCustomFurniture();
        const next = items.filter((f) => f.id !== id);
        if (next.length === items.length) {
            return false;
        }
        writeCustomFurniture(next);
        return true;
    },
};
