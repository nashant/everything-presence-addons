"use strict";
/**
 * AggregationService — orchestrates the full lifecycle of HA template helpers
 * for aggregated room/zone entities (occupancy, target counts, environmental).
 *
 * Lifecycle:
 *   1. resolveEntityIds() — gather per-sensor entity IDs from device mappings
 *   2. reconcile() — delete stale → create new → attach → track in room.haEntities
 *   3. cleanup() — delete all tracked template helpers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregationService = void 0;
const slotAllocator_1 = require("./slotAllocator");
const aggregationTemplates_1 = require("./aggregationTemplates");
// ── Service ──────────────────────────────────────────────────────────
class AggregationService {
    constructor(deps) {
        this.api = deps.haHelperApi;
        this.profileLoader = deps.profileLoader;
        this.logger = deps.logger;
        this.getDeviceMapping = deps.getDeviceMapping;
    }
    /**
     * Resolve per-sensor entity IDs from device mappings and slot allocator.
     * Sensors without device mappings are skipped (partial discovery).
     */
    resolveEntityIds(room, assignments) {
        const sensors = room.sensors ?? [];
        const contributions = [];
        for (const sensor of sensors) {
            const mapping = this.getDeviceMapping(sensor.deviceId);
            if (!mapping) {
                this.logger.warn({ deviceId: sensor.deviceId, roomId: room.id }, "aggregation: sensor has no device mapping, skipping");
                continue;
            }
            const contrib = {
                deviceId: sensor.deviceId,
                esphomeNodeName: mapping.esphomeNodeName,
                presence: mapping.mappings.presence ?? undefined,
                trackingTargetCount: mapping.mappings.trackingTargetCount ?? undefined,
                temperature: mapping.mappings.temperature ?? undefined,
                humidity: mapping.mappings.humidity ?? undefined,
                illuminance: mapping.mappings.illuminance ?? undefined,
                co2: mapping.mappings.co2 ?? undefined,
                zoneOccupancy: {},
                zoneTargetCount: {},
            };
            // Resolve zone-level entity IDs from slot assignments + profile templates
            const profile = this.profileLoader.getProfileById(sensor.profileId);
            const sensorAssignments = assignments.filter((a) => a.deviceId === sensor.deviceId);
            for (const assignment of sensorAssignments) {
                if (assignment.zoneType !== "regular")
                    continue;
                // Look up zone occupancy/target count entity IDs
                const occKey = `zone${assignment.slotIndex}Occupancy`;
                const tcKey = `zone${assignment.slotIndex}TargetCount`;
                // Try device mapping first
                const occEntityId = mapping.mappings[occKey];
                const tcEntityId = mapping.mappings[tcKey];
                if (occEntityId) {
                    contrib.zoneOccupancy[assignment.zoneId] = occEntityId;
                }
                else if (profile?.entities?.[occKey]) {
                    // Fall back to profile template resolution
                    const resolved = profile.entities[occKey].template.replace("${name}", mapping.esphomeNodeName ?? "");
                    if (resolved && mapping.esphomeNodeName) {
                        contrib.zoneOccupancy[assignment.zoneId] = resolved;
                    }
                }
                if (tcEntityId) {
                    contrib.zoneTargetCount[assignment.zoneId] = tcEntityId;
                }
                else if (profile?.entities?.[tcKey]) {
                    const resolved = profile.entities[tcKey].template.replace("${name}", mapping.esphomeNodeName ?? "");
                    if (resolved && mapping.esphomeNodeName) {
                        contrib.zoneTargetCount[assignment.zoneId] = resolved;
                    }
                }
            }
            contributions.push(contrib);
        }
        return contributions;
    }
    /**
     * Build the list of template helpers to create based on resolved entity contributions.
     */
    buildHelperPlans(room, contributions, config) {
        const plans = [];
        const roomName = room.name;
        // 1. Room-level occupancy (aggregated presence)
        const presenceIds = contributions
            .map((c) => c.presence)
            .filter((id) => !!id);
        if (presenceIds.length > 0) {
            plans.push({
                name: `${roomName} Occupancy`,
                helperType: "binary_sensor",
                template: (0, aggregationTemplates_1.buildPresenceTemplate)(presenceIds, config.presenceMode, config.tieBreaker),
                deviceClass: "occupancy",
                trackingType: "room_occupancy",
            });
        }
        // 2. Room-level target count (summed)
        const targetCountIds = contributions
            .map((c) => c.trackingTargetCount)
            .filter((id) => !!id);
        if (targetCountIds.length > 0) {
            plans.push({
                name: `${roomName} Target Count`,
                helperType: "sensor",
                template: (0, aggregationTemplates_1.buildTargetCountTemplate)(targetCountIds),
                trackingType: "room_target_count",
            });
        }
        // 3. Per-zone occupancy
        const zoneIds = new Set();
        for (const c of contributions) {
            for (const zId of Object.keys(c.zoneOccupancy))
                zoneIds.add(zId);
        }
        for (const zoneId of zoneIds) {
            const zoneEntityIds = contributions
                .map((c) => c.zoneOccupancy[zoneId])
                .filter((id) => !!id);
            if (zoneEntityIds.length === 0)
                continue;
            // Zone may have an override
            const override = config.zoneOverrides?.[zoneId];
            const zonePresenceMode = override?.presenceMode ?? config.presenceMode;
            const zoneTieBreaker = override?.tieBreaker ?? config.tieBreaker;
            const zoneName = room.namedZones?.find((z) => z.id === zoneId)?.name ?? zoneId;
            plans.push({
                name: `${roomName} ${zoneName} Occupancy`,
                helperType: "binary_sensor",
                template: (0, aggregationTemplates_1.buildPresenceTemplate)(zoneEntityIds, zonePresenceMode, zoneTieBreaker),
                deviceClass: "occupancy",
                trackingType: "zone_occupancy",
                zoneId,
            });
        }
        // 4. Per-zone target count
        const tcZoneIds = new Set();
        for (const c of contributions) {
            for (const zId of Object.keys(c.zoneTargetCount))
                tcZoneIds.add(zId);
        }
        for (const zoneId of tcZoneIds) {
            const zoneEntityIds = contributions
                .map((c) => c.zoneTargetCount[zoneId])
                .filter((id) => !!id);
            if (zoneEntityIds.length === 0)
                continue;
            const zoneName = room.namedZones?.find((z) => z.id === zoneId)?.name ?? zoneId;
            plans.push({
                name: `${roomName} ${zoneName} Target Count`,
                helperType: "sensor",
                template: (0, aggregationTemplates_1.buildTargetCountTemplate)(zoneEntityIds),
                trackingType: "zone_target_count",
                zoneId,
            });
        }
        // 5. Environmental sensors (temperature, humidity, illuminance, co2)
        const envTypes = [
            { key: "temperature", label: "Temperature" },
            { key: "humidity", label: "Humidity" },
            { key: "illuminance", label: "Illuminance" },
            { key: "co2", label: "CO2" },
        ];
        for (const envType of envTypes) {
            const entityIds = contributions
                .map((c) => c[envType.key])
                .filter((id) => !!id);
            if (entityIds.length === 0)
                continue;
            plans.push({
                name: `${roomName} ${envType.label}`,
                helperType: "sensor",
                template: (0, aggregationTemplates_1.buildEnvironmentalTemplate)(entityIds, config.environmentalMethod),
                trackingType: "environmental",
                environmentalType: envType.key,
            });
        }
        return plans;
    }
    /**
     * Reconcile aggregation template helpers for a room.
     *
     * 1. Delete any existing tracked helpers (idempotent)
     * 2. Resolve entity IDs from device mappings + slot allocator
     * 3. Generate Jinja2 templates
     * 4. Create helpers in HA, attach to device, track in haEntities
     */
    async reconcile(room, config, mqttIdentifier) {
        const created = [];
        const deleted = [];
        const errors = [];
        // Step 1: Delete existing helpers
        const existing = room.haEntities?.templateHelpers ?? [];
        for (const helper of existing) {
            try {
                await this.api.deleteTemplateHelper(helper.configEntryId);
                deleted.push(helper.configEntryId);
            }
            catch (err) {
                // Already gone in HA — not an error for reconciliation
                this.logger.warn({
                    configEntryId: helper.configEntryId,
                    error: err.message,
                }, "aggregation: failed to delete stale helper (may already be gone)");
            }
        }
        // Step 2: Resolve entity IDs
        const sensors = room.sensors ?? [];
        const getProfileLimits = (profileId) => this.profileLoader.getProfileById(profileId)?.limits;
        const allocationResult = (0, slotAllocator_1.allocateSlots)(room.namedZones ?? [], sensors, getProfileLimits);
        const contributions = this.resolveEntityIds(room, allocationResult.assignments);
        if (contributions.length === 0) {
            this.logger.info({ roomId: room.id }, "aggregation: no sensors with device mappings, nothing to create");
            const haEntities = {
                ...room.haEntities,
                templateHelpers: [],
                updatedAt: new Date().toISOString(),
            };
            return { haEntities, created, deleted, errors };
        }
        // Step 3: Build helper plans
        const plans = this.buildHelperPlans(room, contributions, config);
        // Step 4: Look up HA device ID for the MQTT room device
        let haDeviceId = null;
        try {
            haDeviceId = await this.api.lookupHaDeviceId(mqttIdentifier);
        }
        catch (err) {
            const cause = `HA device ID lookup failed: ${err.message}`;
            this.logger.error({ roomId: room.id, mqttIdentifier, error: cause }, "aggregation: device lookup failed");
            return {
                haEntities: {
                    ...room.haEntities,
                    templateHelpers: [],
                    updatedAt: new Date().toISOString(),
                },
                created,
                deleted,
                errors: [{ name: "device_lookup", cause }],
            };
        }
        if (!haDeviceId) {
            const cause = `MQTT device "${mqttIdentifier}" not found in HA device registry`;
            this.logger.error({ roomId: room.id, mqttIdentifier }, cause);
            return {
                haEntities: {
                    ...room.haEntities,
                    templateHelpers: [],
                    updatedAt: new Date().toISOString(),
                },
                created,
                deleted,
                errors: [{ name: "device_lookup", cause }],
            };
        }
        // Step 5: Create helpers, attach to device, track
        const templateHelpers = [];
        for (const plan of plans) {
            try {
                // Create the template helper in HA
                const { configEntryId } = await this.api.createTemplateHelper({
                    type: plan.helperType,
                    name: plan.name,
                    state: plan.template,
                    deviceClass: plan.deviceClass,
                });
                // Attach to the MQTT room device
                await this.api.attachHelperToDevice(configEntryId, haDeviceId, plan.template);
                created.push(configEntryId);
                // We'll look up entity IDs in bulk after all helpers are created
                templateHelpers.push({
                    configEntryId,
                    entityId: "", // Will be filled after bulk lookup
                    type: plan.trackingType,
                    ...(plan.zoneId ? { zoneId: plan.zoneId } : {}),
                    ...(plan.environmentalType
                        ? { environmentalType: plan.environmentalType }
                        : {}),
                });
            }
            catch (err) {
                errors.push({
                    name: plan.name,
                    cause: err.message,
                });
                this.logger.error({
                    name: plan.name,
                    error: err.message,
                    roomId: room.id,
                }, "aggregation: failed to create helper");
            }
        }
        // Step 6: Bulk look up entity IDs for created helpers
        if (templateHelpers.length > 0) {
            try {
                const configEntryIds = templateHelpers.map((h) => h.configEntryId);
                const entityIdMap = await this.api.lookupEntityIdsByConfigEntry(configEntryIds);
                for (const helper of templateHelpers) {
                    helper.entityId =
                        entityIdMap[helper.configEntryId] ?? helper.configEntryId;
                }
            }
            catch (err) {
                this.logger.warn({ roomId: room.id, error: err.message }, "aggregation: entity ID lookup failed, using configEntryId as fallback");
                // Leave entityId empty — the configEntryId is still tracked
            }
        }
        const haEntities = {
            ...room.haEntities,
            mqttDeviceId: haDeviceId,
            templateHelpers,
            updatedAt: new Date().toISOString(),
        };
        this.logger.info({
            action: "reconcile",
            roomId: room.id,
            helpersCreated: created.length,
            helpersDeleted: deleted.length,
            errors: errors.length > 0 ? errors : undefined,
        }, "aggregation reconciliation complete");
        return { haEntities, created, deleted, errors };
    }
    /**
     * Delete all tracked template helpers for a room.
     * Handles missing configEntryIds gracefully (already deleted in HA).
     */
    async cleanup(room) {
        const helpers = room.haEntities?.templateHelpers ?? [];
        for (const helper of helpers) {
            try {
                await this.api.deleteTemplateHelper(helper.configEntryId);
                this.logger.debug({ configEntryId: helper.configEntryId }, "aggregation: deleted helper during cleanup");
            }
            catch (err) {
                // Already gone — not an error during cleanup
                this.logger.warn({
                    configEntryId: helper.configEntryId,
                    error: err.message,
                }, "aggregation: helper already gone during cleanup");
            }
        }
        this.logger.info({
            action: "cleanup",
            roomId: room.id,
            helpersDeleted: helpers.length,
        }, "aggregation cleanup complete");
    }
}
exports.AggregationService = AggregationService;
