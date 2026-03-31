import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MqttClient } from '../../ha/mqttClient';
import { RoomDeviceService, type RoomDeviceDescriptor } from '../../ha/roomDeviceService';
import { WsReadTransport } from '../../ha/wsReadTransport';

// ---------------------------------------------------------------------------
// Config — defaults match the dev stack (docker-compose.dev.yaml)
// ---------------------------------------------------------------------------

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883';
const HA_BASE_URL = process.env.HA_BASE_URL ?? 'http://localhost:18123';
const HA_TOKEN = process.env.HA_LONG_LIVED_TOKEN ?? '';

// Time to wait for HA to process MQTT discovery messages (ms)
const DISCOVERY_SETTLE_MS = 3000;

// ---------------------------------------------------------------------------
// Test descriptor — hardcoded room with 2 zones, 2 aggregation strategies
// ---------------------------------------------------------------------------

const TEST_ROOM_DESCRIPTOR: RoomDeviceDescriptor = {
  roomId: 'bedroom_01',
  roomName: 'Bedroom',
  zones: [
    {
      zoneId: 'zone_0',
      zoneName: 'Zone 1',
      zoneIndex: 0,
      aggregationMode: 'or',
      coveringSensorEntities: {
        occupancy: [
          'binary_sensor.mock_ep_lite_1_zone_2_occupancy',
          'binary_sensor.mock_ep_lite_2_zone_1_occupancy',
        ],
        targetCount: [
          'sensor.mock_ep_lite_1_zone_2_target_count',
          'sensor.mock_ep_lite_2_zone_1_target_count',
        ],
      },
    },
    {
      zoneId: 'zone_1',
      zoneName: 'Zone 2',
      zoneIndex: 1,
      aggregationMode: 'majority',
      coveringSensorEntities: {
        occupancy: [
          'binary_sensor.mock_ep_lite_1_zone_2_occupancy',
          'binary_sensor.mock_ep_lite_2_zone_1_occupancy',
        ],
        targetCount: [
          'sensor.mock_ep_lite_1_zone_2_target_count',
          'sensor.mock_ep_lite_2_zone_1_target_count',
        ],
      },
    },
  ],
};

const EXPECTED_NODE_ID = 'ep_room_bedroom_01';

// HA derives entity_id from the object_id field in MQTT discovery payloads.
// Our discovery payload sets object_id to e.g. 'zone_0_occupancy' (without room prefix),
// so HA creates entity_id 'binary_sensor.zone_0_occupancy'. The unique_id is
// 'ep_room_bedroom_01_zone_0_occupancy' but that's only used for deduplication,
// not for entity_id derivation.
const EXPECTED_ENTITY_IDS = [
  'binary_sensor.zone_0_occupancy',
  'binary_sensor.zone_1_occupancy',
  'sensor.zone_0_target_count',
  'sensor.zone_1_target_count',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to read the HA token from the Docker shared volume if not in env. */
async function resolveHaToken(): Promise<string> {
  if (HA_TOKEN) return HA_TOKEN;

  // Try reading from the Docker volume via a throwaway container.
  // This matches what dev-start.sh does.
  try {
    const { execSync } = await import('child_process');
    const token = execSync(
      'docker run --rm -v "dev_shared-tokens:/shared" alpine:3.19 cat /shared/ha-token',
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim();
    if (token) return token;
  } catch {
    // Silently fall through — the test will skip if we can't get a token
  }
  return '';
}

/** Check if the MQTT broker is reachable by attempting a quick connect/disconnect. */
async function isMqttReachable(): Promise<boolean> {
  const probe = new MqttClient({ brokerUrl: MQTT_BROKER_URL });
  try {
    await Promise.race([
      probe.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    await probe.disconnect();
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Integration: Room device MQTT discovery lifecycle', () => {
  let mqttClient: MqttClient;
  let wsTransport: WsReadTransport;
  let roomService: RoomDeviceService;
  let haToken = '';
  let skipSuite = false;

  beforeAll(async () => {
    // ---- Pre-flight: check MQTT broker ----
    const mqttOk = await isMqttReachable();
    if (!mqttOk) {
      console.warn(
        `[SKIP] MQTT broker not reachable at ${MQTT_BROKER_URL}. ` +
          'Start the dev stack: cd dev && docker compose -f docker-compose.dev.yaml up -d',
      );
      skipSuite = true;
      return;
    }

    // ---- Pre-flight: resolve HA token ----
    haToken = await resolveHaToken();
    if (!haToken) {
      console.warn(
        '[SKIP] No HA token available. Set HA_LONG_LIVED_TOKEN env var or ensure the dev stack ' +
          'ha-bootstrap container has run.',
      );
      skipSuite = true;
      return;
    }

    // ---- Connect MQTT client ----
    mqttClient = new MqttClient({ brokerUrl: MQTT_BROKER_URL });
    await mqttClient.connect();

    // ---- Connect WS transport ----
    wsTransport = new WsReadTransport({
      baseUrl: `${HA_BASE_URL}/api`,
      token: haToken,
      mode: 'standalone',
    });
    await wsTransport.connect();

    // ---- Create RoomDeviceService ----
    roomService = new RoomDeviceService(mqttClient);

    // ---- Pre-cleanup: ensure no stale test entities ----
    try {
      await roomService.removeRoomDevice(
        TEST_ROOM_DESCRIPTOR.roomId,
        TEST_ROOM_DESCRIPTOR.zones.length,
      );
      await sleep(DISCOVERY_SETTLE_MS);
    } catch {
      // Ignore — there may be nothing to clean up
    }
  }, 30_000);

  afterAll(async () => {
    if (skipSuite) return;

    // Cleanup: ensure test entities are removed even if a test failed mid-flight
    try {
      await roomService.removeRoomDevice(
        TEST_ROOM_DESCRIPTOR.roomId,
        TEST_ROOM_DESCRIPTOR.zones.length,
      );
      await sleep(DISCOVERY_SETTLE_MS);
    } catch {
      // Best effort
    }

    // Disconnect in reverse order
    try {
      wsTransport?.disconnect();
    } catch { /* best effort */ }
    try {
      await mqttClient?.disconnect();
    } catch { /* best effort */ }
  }, 30_000);

  // ---------- Lifecycle test ----------

  it('creates a room device, verifies it in HA, removes it, verifies removal', async () => {
    if (skipSuite) {
      console.warn('[SKIP] Docker dev stack not available — skipping integration test');
      return;
    }

    // ---- Step 1: Create room device ----
    await roomService.createRoomDevice(TEST_ROOM_DESCRIPTOR);
    console.log('[integration] Published MQTT discovery messages for room device');

    // ---- Step 2: Wait for HA to process discovery ----
    await sleep(DISCOVERY_SETTLE_MS);

    // ---- Step 3: Verify device appears in HA device registry ----
    const devices = await wsTransport.listDevices();
    // HA wraps MQTT device identifiers as ["mqtt", "<identifier>"] tuples
    const roomDevice = devices.find((d) =>
      d.identifiers?.some(
        (pair) => Array.isArray(pair) && pair[0] === 'mqtt' && pair[1] === EXPECTED_NODE_ID,
      ),
    );

    expect(roomDevice).toBeDefined();
    console.log(
      `[integration] Device found: identifiers=${JSON.stringify(roomDevice?.identifiers)}, name=${roomDevice?.name}`,
    );

    // ---- Step 4: Verify entities appear in HA entity registry ----
    const entities = await wsTransport.listEntityRegistry();
    const entityIds = entities.map((e) => e.entity_id);

    for (const expectedId of EXPECTED_ENTITY_IDS) {
      expect(entityIds).toContain(expectedId);
      console.log(`[integration] Entity found: ${expectedId}`);
    }

    // ---- Step 5: Verify binary sensor entities have correct platform (mqtt) ----
    const binarySensorEntities = entities.filter(
      (e) =>
        EXPECTED_ENTITY_IDS.includes(e.entity_id) &&
        e.entity_id.startsWith('binary_sensor.') &&
        e.platform === 'mqtt',
    );
    expect(binarySensorEntities.length).toBeGreaterThanOrEqual(2);

    const sensorEntities = entities.filter(
      (e) =>
        EXPECTED_ENTITY_IDS.includes(e.entity_id) &&
        e.entity_id.startsWith('sensor.') &&
        e.platform === 'mqtt',
    );
    expect(sensorEntities.length).toBeGreaterThanOrEqual(2);
    console.log(
      `[integration] Platform verified: ${binarySensorEntities.length} binary_sensors, ${sensorEntities.length} sensors via MQTT`,
    );

    // ---- Step 6: Remove room device ----
    await roomService.removeRoomDevice(
      TEST_ROOM_DESCRIPTOR.roomId,
      TEST_ROOM_DESCRIPTOR.zones.length,
    );
    console.log('[integration] Published MQTT removal messages');

    // ---- Step 7: Wait for HA to process removal ----
    await sleep(DISCOVERY_SETTLE_MS);

    // ---- Step 8: Verify entities removed from HA entity registry ----
    const entitiesAfterRemoval = await wsTransport.listEntityRegistry();
    const remainingEntityIds = entitiesAfterRemoval.map((e) => e.entity_id);

    for (const expectedId of EXPECTED_ENTITY_IDS) {
      expect(remainingEntityIds).not.toContain(expectedId);
      console.log(`[integration] Entity removed: ${expectedId}`);
    }

    // ---- Step 9: Verify device removed from HA device registry ----
    const devicesAfterRemoval = await wsTransport.listDevices();
    const remainingDevice = devicesAfterRemoval.find((d) =>
      d.identifiers?.some(
        (pair) => Array.isArray(pair) && pair[0] === 'mqtt' && pair[1] === EXPECTED_NODE_ID,
      ),
    );
    expect(remainingDevice).toBeUndefined();
    console.log('[integration] Device removed from registry');
  }, 30_000);
});
