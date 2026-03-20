"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRoomDevicePayload = buildRoomDevicePayload;
exports.buildInitialStates = buildInitialStates;
exports.publishRoomDevice = publishRoomDevice;
exports.updateRoomDeviceStates = updateRoomDeviceStates;
exports.removeRoomDevice = removeRoomDevice;
// ── Constants ────────────────────────────────────────────────────────
const DISCOVERY_PREFIX = "homeassistant/device";
const STATE_PREFIX = "ep_room";
/** Build the discovery topic for a room device. */
function discoveryTopic(roomId) {
    return `${DISCOVERY_PREFIX}/ep_room_${roomId}/config`;
}
/** Build the state topic for an entity within a room device. */
function stateTopic(roomId, entityKey) {
    return `${STATE_PREFIX}/${roomId}/${entityKey}/state`;
}
/** Build the availability topic for a room device. */
function availabilityTopic(roomId) {
    return `${STATE_PREFIX}/${roomId}/availability`;
}
/**
 * Generate the MQTT device discovery payload for a room.
 * Uses the HA device discovery format (single payload with `cmps` component map).
 */
function buildRoomDevicePayload(room, version) {
    const deviceId = `ep_room_${room.id}`;
    const cmps = {};
    // Note: occupancy and target_count are now HA template helpers
    // managed by AggregationService (S07), not MQTT discovery entities.
    // ── Room configuration entities ──
    cmps.sensor_count = {
        p: "sensor",
        entity_category: "diagnostic",
        name: "Sensor Count",
        unique_id: `${deviceId}_sensor_count`,
        object_id: `${deviceId}_sensor_count`,
        stat_t: stateTopic(room.id, "sensor_count"),
    };
    cmps.presence_mode = {
        p: "sensor",
        entity_category: "config",
        name: "Presence Mode",
        unique_id: `${deviceId}_presence_mode`,
        object_id: `${deviceId}_presence_mode`,
        stat_t: stateTopic(room.id, "presence_mode"),
    };
    cmps.temperature_mode = {
        p: "sensor",
        entity_category: "config",
        name: "Temperature Mode",
        unique_id: `${deviceId}_temperature_mode`,
        object_id: `${deviceId}_temperature_mode`,
        stat_t: stateTopic(room.id, "temperature_mode"),
    };
    cmps.humidity_mode = {
        p: "sensor",
        entity_category: "config",
        name: "Humidity Mode",
        unique_id: `${deviceId}_humidity_mode`,
        object_id: `${deviceId}_humidity_mode`,
        stat_t: stateTopic(room.id, "humidity_mode"),
    };
    cmps.co2_mode = {
        p: "sensor",
        entity_category: "config",
        name: "CO2 Mode",
        unique_id: `${deviceId}_co2_mode`,
        object_id: `${deviceId}_co2_mode`,
        stat_t: stateTopic(room.id, "co2_mode"),
    };
    cmps.lux_mode = {
        p: "sensor",
        entity_category: "config",
        name: "Lux Mode",
        unique_id: `${deviceId}_lux_mode`,
        object_id: `${deviceId}_lux_mode`,
        stat_t: stateTopic(room.id, "lux_mode"),
    };
    return {
        dev: {
            ids: [deviceId],
            name: `Room: ${room.name}`,
            mf: "Everything Presence",
            mdl: "Room Aggregation",
            sw: version,
        },
        o: {
            name: "EP Configurator",
            sw: version,
            url: "https://everythingpresence.com",
        },
        avty: [{ topic: availabilityTopic(room.id) }],
        cmps,
    };
}
// ── Initial State Builder ────────────────────────────────────────────
/**
 * Build initial state values for all entities in a room device.
 * Returns a map of { entityKey: stateValue }.
 */
function buildInitialStates(room) {
    const metadata = room.metadata;
    // Note: occupancy and target_count are now HA template helpers
    // managed by AggregationService (S07), not MQTT state entities.
    return {
        sensor_count: String(room.sensors?.length ?? 0),
        presence_mode: metadata?.presence_mode ?? "any",
        temperature_mode: metadata?.temperature_mode ?? "average",
        humidity_mode: metadata?.humidity_mode ?? "average",
        co2_mode: metadata?.co2_mode ?? "average",
        lux_mode: metadata?.lux_mode ?? "average",
    };
}
// ── Publish / Update / Remove ────────────────────────────────────────
/**
 * Publish MQTT discovery for a room device, including availability and all
 * initial entity states. All messages are retained.
 *
 * No-op when mqttClient is null (MQTT disabled).
 */
async function publishRoomDevice(room, mqttClient, version, logger) {
    if (!mqttClient)
        return;
    const topic = discoveryTopic(room.id);
    const payload = buildRoomDevicePayload(room, version);
    const states = buildInitialStates(room);
    const entityCount = Object.keys(payload.cmps).length;
    // Publish discovery payload
    await mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
    // Publish availability online
    await mqttClient.publish(availabilityTopic(room.id), "online", { retain: true });
    // Publish all initial entity states
    for (const [key, value] of Object.entries(states)) {
        await mqttClient.publish(stateTopic(room.id, key), value, { retain: true });
    }
    logger?.info({ roomId: room.id, roomName: room.name, topic, entityCount }, "MQTT room device published");
}
/**
 * Republish only state values for a room device (no discovery republish).
 * Used when room config changes (sensors added/removed, mode changed).
 *
 * No-op when mqttClient is null (MQTT disabled).
 */
async function updateRoomDeviceStates(room, mqttClient, logger) {
    if (!mqttClient)
        return;
    const states = buildInitialStates(room);
    for (const [key, value] of Object.entries(states)) {
        await mqttClient.publish(stateTopic(room.id, key), value, { retain: true });
    }
    logger?.info({ roomId: room.id, roomName: room.name, stateCount: Object.keys(states).length }, "MQTT room device states updated");
}
/**
 * Remove a room device by publishing an empty string to its discovery topic
 * with retain:true. HA removes all entities and the device.
 *
 * No-op when mqttClient is null (MQTT disabled).
 */
async function removeRoomDevice(roomId, mqttClient, logger) {
    if (!mqttClient)
        return;
    const topic = discoveryTopic(roomId);
    await mqttClient.publish(topic, "", { retain: true });
    logger?.info({ roomId, topic }, "MQTT room device removed");
}
