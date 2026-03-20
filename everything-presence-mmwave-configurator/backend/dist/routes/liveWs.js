"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLiveWebSocketServer = createLiveWebSocketServer;
const ws_1 = require("ws");
const logger_1 = require("../logger");
const entityResolver_1 = require("../domain/entityResolver");
const deviceEntityService_1 = require("../domain/deviceEntityService");
const deviceMappingStorage_1 = require("../config/deviceMappingStorage");
function createLiveWebSocketServer(httpServer, readTransport, profileLoader) {
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: '/api/live/ws' });
    const clients = new Map();
    // Subscribe to HA state changes
    readTransport.subscribeToStateChanges([], // Empty = subscribe to all entities
    (entityId, newState, _oldState) => {
        if (!entityId || !newState)
            return;
        // Broadcast to clients subscribed to this entity
        clients.forEach((subscription, clientWs) => {
            if (subscription.entityIds.has(entityId) && clientWs.readyState === ws_1.WebSocket.OPEN) {
                try {
                    clientWs.send(JSON.stringify({
                        type: 'state_update',
                        entityId,
                        state: newState.state,
                        attributes: newState.attributes,
                        timestamp: Date.now(),
                    }));
                }
                catch (err) {
                    logger_1.logger.error({ err, entityId }, 'Failed to send state update to client');
                }
            }
        });
    });
    wss.on('connection', (ws) => {
        logger_1.logger.info('Live tracking WebSocket client connected');
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'subscribe') {
                    const { deviceId, profileId, entityNamePrefix, entityMappings } = message;
                    if (!deviceId || !profileId) {
                        ws.send(JSON.stringify({ type: 'error', error: 'deviceId and profileId required' }));
                        return;
                    }
                    const profile = profileLoader.getProfileById(profileId);
                    if (!profile) {
                        ws.send(JSON.stringify({ type: 'error', error: 'Profile not found' }));
                        return;
                    }
                    // Use entityNamePrefix if provided, otherwise try to extract from deviceId
                    const deviceName = entityNamePrefix ||
                        deviceId
                            .replace(/^(sensor|binary_sensor|number)\./, '')
                            .replace(/_occupancy$|_mmwave_target_distance$/, '');
                    if (!deviceName) {
                        ws.send(JSON.stringify({ type: 'error', error: 'Could not determine entity name prefix' }));
                        return;
                    }
                    // Parse entityMappings if provided (could be string or object)
                    let parsedMappings;
                    if (entityMappings) {
                        if (typeof entityMappings === 'string') {
                            try {
                                parsedMappings = JSON.parse(entityMappings);
                            }
                            catch {
                                logger_1.logger.warn('Invalid entityMappings JSON in WebSocket message');
                            }
                        }
                        else {
                            parsedMappings = entityMappings;
                        }
                    }
                    // Check if device has device-level mappings (preferred)
                    const hasDeviceMapping = deviceMappingStorage_1.deviceMappingStorage.hasMapping(deviceId);
                    // Signal MAPPING_NOT_FOUND if no device mapping and no legacy mappings provided
                    const hasMappings = hasDeviceMapping || !!parsedMappings;
                    if (!hasMappings) {
                        logger_1.logger.warn({ deviceId, profileId }, 'No device mappings found - entity resolution may fail');
                        // Send warning to client - they should run entity discovery
                        ws.send(JSON.stringify({
                            type: 'warning',
                            code: 'MAPPING_NOT_FOUND',
                            message: 'No entity mappings found for this device. Run entity discovery to auto-match entities.',
                            deviceId,
                        }));
                    }
                    // Build list of entity IDs to monitor using EntityResolver
                    const entityIds = new Set();
                    const entityMap = profile.entityMap;
                    // Helper to resolve entity ID - tries device mapping first, then legacy
                    const addEntity = (mappingKey, pattern) => {
                        let entityId = null;
                        // Try device-level mapping first
                        if (hasDeviceMapping) {
                            entityId = deviceEntityService_1.deviceEntityService.getEntityId(deviceId, mappingKey);
                        }
                        // Fallback to legacy resolution
                        if (!entityId) {
                            entityId = entityResolver_1.EntityResolver.resolve(parsedMappings, deviceName, mappingKey, pattern);
                        }
                        if (entityId) {
                            entityIds.add(entityId);
                        }
                    };
                    // Add all relevant entities (using mapping key + template)
                    addEntity('presenceEntity', entityMap.presenceEntity);
                    addEntity('mmwaveEntity', entityMap.mmwaveEntity);
                    addEntity('pirEntity', entityMap.pirEntity);
                    addEntity('temperatureEntity', entityMap.temperatureEntity);
                    addEntity('humidityEntity', entityMap.humidityEntity);
                    addEntity('illuminanceEntity', entityMap.illuminanceEntity);
                    addEntity('lightEntity', entityMap.lightEntity);
                    addEntity('co2Entity', entityMap.co2Entity);
                    // Distance tracking entities (EP1)
                    addEntity('distanceEntity', entityMap.distanceEntity);
                    addEntity('speedEntity', entityMap.speedEntity);
                    addEntity('energyEntity', entityMap.energyEntity);
                    addEntity('targetCountEntity', entityMap.targetCountEntity);
                    addEntity('modeEntity', entityMap.modeEntity);
                    // EP Lite tracking
                    addEntity('trackingTargetCountEntity', entityMap.trackingTargetCountEntity);
                    addEntity('trackingTargetsEntity', entityMap.trackingTargetsEntity);
                    addEntity('maxDistanceEntity', entityMap.maxDistanceEntity);
                    addEntity('installationAngleEntity', entityMap.installationAngleEntity);
                    // EP1 config entities for distance overlays
                    addEntity('distanceMaxEntity', entityMap.distanceMaxEntity);
                    addEntity('triggerDistanceEntity', entityMap.triggerDistanceEntity);
                    // Add zone-specific target count entities (for EP Lite zones 2, 3, 4)
                    if (entityMap.zoneConfigEntities) {
                        const zones = entityMap.zoneConfigEntities;
                        Object.keys(zones).forEach((zoneKey) => {
                            const zone = zones[zoneKey];
                            if (zone.targetCountEntity) {
                                // Use mapping key like "zoneConfigEntities.zone1.targetCountEntity"
                                addEntity(`zoneConfigEntities.${zoneKey}.targetCountEntity`, zone.targetCountEntity);
                            }
                        });
                    }
                    // Zone target counts and occupancy - use device profile templates (supports EPL and EPP)
                    const capabilities = profile.capabilities;
                    const entities = profile.entities;
                    if (capabilities?.zones && entities) {
                        for (let i = 1; i <= 4; i++) {
                            // Use device profile templates for correct entity patterns per device type
                            const zoneTargetCountKey = `zone${i}TargetCount`;
                            const zoneOccupancyKey = `zone${i}Occupancy`;
                            const targetCountTemplate = entities[zoneTargetCountKey]?.template;
                            const occupancyTemplate = entities[zoneOccupancyKey]?.template;
                            if (targetCountTemplate) {
                                addEntity(zoneTargetCountKey, targetCountTemplate);
                            }
                            if (occupancyTemplate) {
                                addEntity(zoneOccupancyKey, occupancyTemplate);
                            }
                        }
                    }
                    // Subscribe to target position entities (target_1, target_2, target_3)
                    // Tries device mapping first, then legacy resolution
                    for (let i = 1; i <= 3; i++) {
                        const targetProps = ['x', 'y', 'distance', 'speed', 'angle', 'resolution', 'active'];
                        // Try to get all target entities from device mapping first
                        let targetSet = null;
                        if (hasDeviceMapping) {
                            targetSet = deviceEntityService_1.deviceEntityService.getTargetEntities(deviceId, i);
                        }
                        for (const prop of targetProps) {
                            let entityId = null;
                            // Try device mapping first
                            if (targetSet && targetSet[prop]) {
                                entityId = targetSet[prop];
                            }
                            // Fallback to legacy resolution
                            if (!entityId) {
                                entityId = entityResolver_1.EntityResolver.resolveTargetEntity(parsedMappings, deviceName, i, prop);
                            }
                            if (entityId) {
                                entityIds.add(entityId);
                            }
                        }
                    }
                    // Subscribe to assumed presence entities (entry/exit feature) - use profile templates
                    if (entities?.assumedPresent?.template) {
                        addEntity('assumedPresent', entities.assumedPresent.template);
                    }
                    if (entities?.assumedPresentRemaining?.template) {
                        addEntity('assumedPresentRemaining', entities.assumedPresentRemaining.template);
                    }
                    // Store subscription
                    const subscriptionId = `${deviceId}-${Date.now()}`;
                    clients.set(ws, {
                        ws,
                        deviceId,
                        profileId,
                        entityIds,
                        subscriptionId,
                    });
                    logger_1.logger.info({ deviceId, profileId, entityCount: entityIds.size }, 'Client subscribed to live tracking');
                    // Send initial states using read transport bulk query
                    try {
                        const entityIdArray = Array.from(entityIds);
                        const initialStates = await readTransport.getStates(entityIdArray);
                        // Send subscription confirmation with initial states
                        const initialStateData = {};
                        initialStates.forEach((state, entityId) => {
                            initialStateData[entityId] = {
                                state: state.state,
                                attributes: state.attributes,
                            };
                        });
                        ws.send(JSON.stringify({
                            type: 'subscribed',
                            deviceId,
                            profileId,
                            entities: entityIdArray,
                            initialStates: initialStateData,
                            hasMappings,
                        }));
                    }
                    catch (err) {
                        logger_1.logger.error({ err }, 'Failed to send initial states');
                        // Still send subscription confirmation even if initial states fail
                        ws.send(JSON.stringify({
                            type: 'subscribed',
                            deviceId,
                            profileId,
                            entities: Array.from(entityIds),
                            hasMappings,
                        }));
                    }
                }
                else if (message.type === 'unsubscribe') {
                    clients.delete(ws);
                    logger_1.logger.info('Client unsubscribed from live tracking');
                }
            }
            catch (err) {
                logger_1.logger.error({ err }, 'Failed to process WebSocket message');
                ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
            }
        });
        ws.on('close', () => {
            clients.delete(ws);
            logger_1.logger.info('Live tracking WebSocket client disconnected');
        });
        ws.on('error', (err) => {
            logger_1.logger.error({ err }, 'WebSocket client error');
            clients.delete(ws);
        });
    });
    return wss;
}
