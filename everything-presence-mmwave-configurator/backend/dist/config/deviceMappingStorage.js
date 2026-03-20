"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceMappingStorage = void 0;
exports.parseFirmwareVersion = parseFirmwareVersion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../logger");
const mappingUtils_1 = require("../domain/mappingUtils");
/**
 * Parse a firmware version string like "1.4.1 (ESPHome 2025.11.2)" into components.
 * Returns null values if parsing fails - this should not break anything.
 */
function parseFirmwareVersion(rawVersion) {
    if (!rawVersion) {
        return { firmwareVersion: undefined, esphomeVersion: undefined };
    }
    // Try to match pattern like "1.4.1 (ESPHome 2025.11.2)"
    const match = rawVersion.match(/^([\d.]+)\s*\(ESPHome\s+([\d.]+)\)$/i);
    if (match) {
        return {
            firmwareVersion: match[1],
            esphomeVersion: match[2],
        };
    }
    // Fallback: If no ESPHome part, try to extract just version number
    const versionMatch = rawVersion.match(/^([\d.]+)/);
    if (versionMatch) {
        return {
            firmwareVersion: versionMatch[1],
            esphomeVersion: undefined,
        };
    }
    // Can't parse - return the raw value as firmware version
    return {
        firmwareVersion: rawVersion,
        esphomeVersion: undefined,
    };
}
// Use same base path as other storage
const DATA_DIR = process.env.DATA_DIR ?? '/config/everything-presence-zone-configurator';
const DEVICES_DIR = path_1.default.join(DATA_DIR, 'devices');
/**
 * Storage class for device entity mappings.
 * Each device has its own JSON file in the devices directory.
 */
class DeviceMappingStorageImpl {
    constructor() {
        this.locks = new Map();
    }
    /**
     * Get the file path for a device mapping.
     */
    getFilePath(deviceId) {
        return path_1.default.join(DEVICES_DIR, `${deviceId}.json`);
    }
    /**
     * Ensure the devices directory exists.
     */
    ensureDirectoryExists() {
        if (!fs_1.default.existsSync(DEVICES_DIR)) {
            fs_1.default.mkdirSync(DEVICES_DIR, { recursive: true });
            logger_1.logger.info({ dir: DEVICES_DIR }, 'Created devices directory');
        }
    }
    /**
     * Get a device mapping by device ID.
     * Returns null if not found or if validation fails.
     */
    getMapping(deviceId) {
        this.ensureDirectoryExists();
        const filePath = this.getFilePath(deviceId);
        if (!fs_1.default.existsSync(filePath)) {
            return null;
        }
        try {
            const raw = fs_1.default.readFileSync(filePath, 'utf-8');
            const mapping = JSON.parse(raw);
            // Validate deviceId matches filename to detect corruption
            if (mapping.deviceId !== deviceId) {
                logger_1.logger.error({ deviceId, fileDeviceId: mapping.deviceId, filePath }, 'Device mapping file has mismatched deviceId - possible corruption');
                return null;
            }
            mapping.mappings = (0, mappingUtils_1.normalizeMappingKeys)(mapping.mappings);
            return mapping;
        }
        catch (error) {
            logger_1.logger.warn({ error: error.message, deviceId, filePath }, 'Failed to read device mapping file');
            return null;
        }
    }
    /**
     * Save a device mapping with atomic write and mutex locking.
     * Ensures concurrent writes to the same device are serialized.
     */
    async saveMapping(mapping) {
        this.ensureDirectoryExists();
        const deviceId = mapping.deviceId;
        // Wait for any pending write to complete
        const pendingLock = this.locks.get(deviceId);
        if (pendingLock) {
            await pendingLock;
        }
        // Create new lock for this write
        const writePromise = this.atomicWrite(deviceId, mapping);
        this.locks.set(deviceId, writePromise);
        try {
            await writePromise;
        }
        finally {
            this.locks.delete(deviceId);
        }
    }
    /**
     * Perform an atomic write operation.
     * Writes to a temp file first, then renames for atomicity.
     * Falls back to direct write with fsync if rename fails.
     */
    async atomicWrite(deviceId, mapping) {
        const filePath = this.getFilePath(deviceId);
        // Keep temp file in same directory for atomic rename compatibility
        const tempPath = path_1.default.join(DEVICES_DIR, `.${deviceId}.tmp`);
        // Update lastUpdated timestamp
        mapping.lastUpdated = new Date().toISOString();
        const content = JSON.stringify(mapping, null, 2);
        try {
            // Write to temp file
            fs_1.default.writeFileSync(tempPath, content, 'utf-8');
            // Atomic rename
            fs_1.default.renameSync(tempPath, filePath);
            logger_1.logger.debug({ deviceId }, 'Device mapping saved successfully');
        }
        catch (renameErr) {
            // Fallback: direct write with fsync for systems where rename fails
            logger_1.logger.warn({ deviceId, error: renameErr.message }, 'Atomic rename failed, using direct write with fsync');
            const fd = fs_1.default.openSync(filePath, 'w');
            try {
                fs_1.default.writeSync(fd, content);
                fs_1.default.fsyncSync(fd);
            }
            finally {
                fs_1.default.closeSync(fd);
            }
        }
        finally {
            // Clean up temp file if it exists
            try {
                if (fs_1.default.existsSync(tempPath)) {
                    fs_1.default.unlinkSync(tempPath);
                }
            }
            catch {
                // Ignore cleanup errors
            }
        }
    }
    /**
     * Delete a device mapping.
     * Returns true if deleted, false if not found.
     */
    deleteMapping(deviceId) {
        const filePath = this.getFilePath(deviceId);
        if (!fs_1.default.existsSync(filePath)) {
            return false;
        }
        try {
            fs_1.default.unlinkSync(filePath);
            logger_1.logger.info({ deviceId }, 'Device mapping deleted');
            return true;
        }
        catch (error) {
            logger_1.logger.error({ error: error.message, deviceId }, 'Failed to delete device mapping');
            return false;
        }
    }
    /**
     * List all device mappings.
     */
    listMappings() {
        this.ensureDirectoryExists();
        try {
            const files = fs_1.default.readdirSync(DEVICES_DIR);
            const mappings = [];
            for (const file of files) {
                // Skip temp files and non-JSON files
                if (file.startsWith('.') || !file.endsWith('.json')) {
                    continue;
                }
                // Extract deviceId from filename
                const deviceId = file.slice(0, -5); // Remove .json
                const mapping = this.getMapping(deviceId);
                if (mapping) {
                    mappings.push(mapping);
                }
            }
            return mappings;
        }
        catch (error) {
            logger_1.logger.warn({ error: error.message }, 'Failed to list device mappings');
            return [];
        }
    }
    /**
     * Check if a device has mappings.
     */
    hasMapping(deviceId) {
        return fs_1.default.existsSync(this.getFilePath(deviceId));
    }
    /**
     * Get the devices directory path (for debugging/testing).
     */
    getDevicesDirectory() {
        return DEVICES_DIR;
    }
}
// Export singleton instance
exports.deviceMappingStorage = new DeviceMappingStorageImpl();
