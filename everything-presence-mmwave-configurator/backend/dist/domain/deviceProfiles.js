"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceProfileLoader = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
class DeviceProfileLoader {
    constructor(dir, fallbackDir) {
        this.dir = fs_1.default.existsSync(dir) ? dir : fallbackDir ?? dir;
    }
    listProfiles() {
        if (!fs_1.default.existsSync(this.dir)) {
            logger_1.logger.warn({ dir: this.dir }, 'Device profiles directory missing');
            return [];
        }
        const files = fs_1.default.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
        return files.flatMap((file) => {
            const fullPath = path_1.default.join(this.dir, file);
            try {
                const raw = fs_1.default.readFileSync(fullPath, 'utf-8');
                const parsed = JSON.parse(raw);
                return [parsed];
            }
            catch (error) {
                logger_1.logger.warn({ file: fullPath, error }, 'Failed to parse device profile');
                return [];
            }
        });
    }
    getProfileById(id) {
        return this.listProfiles().find((p) => p.id === id);
    }
}
exports.DeviceProfileLoader = DeviceProfileLoader;
