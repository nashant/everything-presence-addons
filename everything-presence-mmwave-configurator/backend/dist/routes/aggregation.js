"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAggregationRouter = createAggregationRouter;
const express_1 = require("express");
const storage_1 = require("../config/storage");
// ── Constants ────────────────────────────────────────────────────────
const VALID_PRESENCE_MODES = ["any", "all", "majority"];
const VALID_TIE_BREAKERS = ["occupied", "not_occupied", "no_change"];
const VALID_ENVIRONMENTAL_METHODS = ["average", "min", "max"];
const STATE_PREFIX = "ep_room";
/** Default aggregation config when none is stored. */
const DEFAULT_CONFIG = {
    presenceMode: "any",
    tieBreaker: "occupied",
    environmentalMethod: "average",
};
function validateAggregationConfig(body) {
    if (!body || typeof body !== "object") {
        return { ok: false, error: "Request body must be a JSON object" };
    }
    const input = body;
    const config = {};
    if (input.presenceMode !== undefined) {
        if (!VALID_PRESENCE_MODES.includes(input.presenceMode)) {
            return {
                ok: false,
                error: `Invalid presenceMode: "${input.presenceMode}". Must be one of: ${VALID_PRESENCE_MODES.join(", ")}`,
            };
        }
        config.presenceMode = input.presenceMode;
    }
    if (input.tieBreaker !== undefined) {
        if (!VALID_TIE_BREAKERS.includes(input.tieBreaker)) {
            return {
                ok: false,
                error: `Invalid tieBreaker: "${input.tieBreaker}". Must be one of: ${VALID_TIE_BREAKERS.join(", ")}`,
            };
        }
        config.tieBreaker = input.tieBreaker;
    }
    if (input.environmentalMethod !== undefined) {
        if (!VALID_ENVIRONMENTAL_METHODS.includes(input.environmentalMethod)) {
            return {
                ok: false,
                error: `Invalid environmentalMethod: "${input.environmentalMethod}". Must be one of: ${VALID_ENVIRONMENTAL_METHODS.join(", ")}`,
            };
        }
        config.environmentalMethod =
            input.environmentalMethod;
    }
    if (input.zoneOverrides !== undefined) {
        if (typeof input.zoneOverrides !== "object" ||
            input.zoneOverrides === null ||
            Array.isArray(input.zoneOverrides)) {
            return {
                ok: false,
                error: "zoneOverrides must be an object keyed by zone ID",
            };
        }
        const overrides = input.zoneOverrides;
        for (const [zoneId, override] of Object.entries(overrides)) {
            if (typeof override !== "object" || override === null) {
                return {
                    ok: false,
                    error: `zoneOverrides["${zoneId}"] must be an object`,
                };
            }
            const ov = override;
            if (ov.presenceMode !== undefined &&
                !VALID_PRESENCE_MODES.includes(ov.presenceMode)) {
                return {
                    ok: false,
                    error: `Invalid presenceMode in zoneOverrides["${zoneId}"]: "${ov.presenceMode}"`,
                };
            }
            if (ov.tieBreaker !== undefined &&
                !VALID_TIE_BREAKERS.includes(ov.tieBreaker)) {
                return {
                    ok: false,
                    error: `Invalid tieBreaker in zoneOverrides["${zoneId}"]: "${ov.tieBreaker}"`,
                };
            }
        }
        config.zoneOverrides = input.zoneOverrides;
    }
    return { ok: true, config };
}
// ── Helpers ──────────────────────────────────────────────────────────
/**
 * Publish config entity states for aggregation modes via MQTT.
 * The MQTT topic format matches what buildInitialStates uses.
 */
async function publishConfigStates(roomId, config, mqttClient) {
    if (!mqttClient)
        return;
    const stateMap = {
        presence_mode: config.presenceMode,
        temperature_mode: config.environmentalMethod,
        humidity_mode: config.environmentalMethod,
        co2_mode: config.environmentalMethod,
        lux_mode: config.environmentalMethod,
    };
    for (const [key, value] of Object.entries(stateMap)) {
        await mqttClient.publish(`${STATE_PREFIX}/${roomId}/${key}/state`, value, { retain: true });
    }
}
// ── Router ───────────────────────────────────────────────────────────
function createAggregationRouter(deps) {
    const router = (0, express_1.Router)();
    const { aggregationService, mqttClient, logger } = deps;
    /**
     * GET /:id/aggregation — Read aggregation config with defaults.
     */
    router.get("/:id/aggregation", (req, res) => {
        const room = storage_1.storage.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        const stored = room.metadata
            ?.aggregation;
        return res.json({
            aggregation: {
                ...DEFAULT_CONFIG,
                ...stored,
            },
        });
    });
    /**
     * PATCH /:id/aggregation — Update aggregation config.
     * Validates, persists in room.metadata.aggregation, publishes MQTT config states.
     */
    router.patch("/:id/aggregation", async (req, res) => {
        const room = storage_1.storage.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        const validation = validateAggregationConfig(req.body);
        if (!validation.ok) {
            return res.status(400).json({ message: validation.error });
        }
        // Merge with existing config
        const existingConfig = room.metadata?.aggregation;
        const merged = {
            ...DEFAULT_CONFIG,
            ...existingConfig,
            ...validation.config,
        };
        // Store in room.metadata.aggregation
        const updatedMetadata = {
            ...(room.metadata ?? {}),
            aggregation: merged,
        };
        const updatedRoom = {
            ...room,
            metadata: updatedMetadata,
        };
        storage_1.storage.saveRoom(updatedRoom);
        logger.info({ action: "updateAggregation", roomId: room.id, config: merged }, "aggregation config updated");
        // Publish MQTT config entity states
        try {
            await publishConfigStates(room.id, merged, mqttClient);
        }
        catch (err) {
            logger.warn({ roomId: room.id, error: err.message }, "aggregation: failed to publish MQTT config states");
        }
        // Optionally trigger reconciliation if service is available
        if (aggregationService) {
            try {
                const mqttIdentifier = `ep_room_${room.id}`;
                const result = await aggregationService.reconcile(updatedRoom, merged, mqttIdentifier);
                // Save room with updated haEntities
                const reconciledRoom = {
                    ...updatedRoom,
                    haEntities: result.haEntities,
                };
                storage_1.storage.saveRoom(reconciledRoom);
                return res.json({
                    aggregation: merged,
                    reconcile: {
                        created: result.created.length,
                        deleted: result.deleted.length,
                        errors: result.errors,
                    },
                });
            }
            catch (err) {
                logger.error({ roomId: room.id, error: err.message }, "aggregation: reconciliation failed after config update");
                // Config was still saved — return it without reconcile result
                return res.json({ aggregation: merged });
            }
        }
        return res.json({ aggregation: merged });
    });
    /**
     * POST /:id/aggregation/reconcile — Force re-reconcile template helpers.
     * Returns 503 when aggregation service is unavailable.
     */
    router.post("/:id/aggregation/reconcile", async (req, res) => {
        const room = storage_1.storage.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        if (!aggregationService) {
            return res.status(503).json({
                message: "Aggregation service unavailable — Home Assistant dependencies not configured",
            });
        }
        const stored = room.metadata
            ?.aggregation;
        const config = {
            ...DEFAULT_CONFIG,
            ...stored,
        };
        try {
            const mqttIdentifier = `ep_room_${room.id}`;
            const result = await aggregationService.reconcile(room, config, mqttIdentifier);
            // Save room with updated haEntities
            const updatedRoom = {
                ...room,
                haEntities: result.haEntities,
            };
            storage_1.storage.saveRoom(updatedRoom);
            return res.json({
                reconcile: {
                    created: result.created.length,
                    deleted: result.deleted.length,
                    errors: result.errors,
                },
            });
        }
        catch (err) {
            logger.error({ roomId: room.id, error: err.message }, "aggregation: reconciliation failed");
            return res.status(500).json({
                message: "Reconciliation failed",
                error: err.message,
            });
        }
    });
    /**
     * DELETE /:id/aggregation — Clean up all template helpers, clear tracking.
     */
    router.delete("/:id/aggregation", async (req, res) => {
        const room = storage_1.storage.getRoom(req.params.id);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        // Clean up helpers in HA if service available
        if (aggregationService) {
            try {
                await aggregationService.cleanup(room);
            }
            catch (err) {
                logger.warn({ roomId: room.id, error: err.message }, "aggregation: cleanup failed (helpers may already be gone)");
            }
        }
        // Clear template helpers tracking
        const updatedRoom = {
            ...room,
            haEntities: {
                ...room.haEntities,
                templateHelpers: [],
                updatedAt: new Date().toISOString(),
            },
        };
        storage_1.storage.saveRoom(updatedRoom);
        logger.info({ action: "deleteAggregation", roomId: room.id }, "aggregation helpers cleaned up");
        return res.json({ ok: true });
    });
    return router;
}
