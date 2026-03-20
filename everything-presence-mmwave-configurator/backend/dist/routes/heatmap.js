"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHeatmapRouter = void 0;
const express_1 = require("express");
const heatmapService_1 = require("../domain/heatmapService");
const zoneReader_1 = require("../ha/zoneReader");
const logger_1 = require("../logger");
const createHeatmapRouter = (deps) => {
    const router = (0, express_1.Router)();
    const { haConfig, readTransport, profileLoader } = deps;
    const heatmapService = new heatmapService_1.HeatmapService(haConfig);
    const zoneReader = new zoneReader_1.ZoneReader(readTransport);
    /**
     * GET /api/devices/:deviceId/heatmap
     * Generate heatmap data from HA history.
     */
    router.get('/:deviceId/heatmap', async (req, res) => {
        const { profileId, entityNamePrefix, hours, resolution, entityMappings: entityMappingsJson } = req.query;
        if (!profileId || !entityNamePrefix) {
            return res.status(400).json({ message: 'profileId and entityNamePrefix are required' });
        }
        const profile = profileLoader.getProfileById(profileId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        // Check device supports tracking
        const capabilities = profile.capabilities;
        if (!capabilities?.tracking) {
            return res.status(400).json({ message: 'Device does not support tracking' });
        }
        const hoursNum = Math.min(168, Math.max(1, parseInt(hours) || 24));
        const resolutionNum = Math.max(100, Math.min(1000, parseInt(resolution) || 400));
        // Parse entityMappings if provided (JSON string in query param)
        let entityMappings;
        if (entityMappingsJson && typeof entityMappingsJson === 'string') {
            try {
                entityMappings = JSON.parse(entityMappingsJson);
            }
            catch {
                logger_1.logger.warn('Invalid entityMappings JSON in query');
            }
        }
        try {
            // Get deviceId from route params
            const { deviceId } = req.params;
            // Get current zones for zone stats calculation
            const entityMap = profile.entityMap;
            let zones;
            try {
                const polygonZones = await zoneReader.readPolygonZones(entityMap, entityNamePrefix, entityMappings, deviceId);
                const rectZones = await zoneReader.readZones(entityMap, entityNamePrefix, entityMappings, deviceId);
                // Deduplicate zones by ID (prefer polygon zones if both exist)
                const zoneMap = new Map();
                for (const zone of rectZones) {
                    zoneMap.set(zone.id, zone);
                }
                for (const zone of polygonZones) {
                    zoneMap.set(zone.id, zone); // Overwrites rect zone if same ID
                }
                zones = Array.from(zoneMap.values());
            }
            catch {
                // Zones are optional for heatmap
                zones = undefined;
            }
            const heatmap = await heatmapService.generateHeatmap(entityNamePrefix, hoursNum, resolutionNum, zones, entityMappings, deviceId);
            return res.json(heatmap);
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Failed to generate heatmap');
            return res.status(500).json({ message: 'Failed to generate heatmap' });
        }
    });
    return router;
};
exports.createHeatmapRouter = createHeatmapRouter;
