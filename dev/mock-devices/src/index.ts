/**
 * EP Mock Devices — MQTT auto-discovery + target coordinate simulation
 *
 * Reads device profiles from /config/device-profiles/, publishes MQTT discovery
 * messages to create 3 mock EP devices in Home Assistant, then cycles target
 * tracking coordinates and handles command topics for writable entities.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import mqtt, { type MqttClient } from "mqtt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileEntity {
  template: string;
  category: string;
  label?: string;
  controlType?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  subcategory?: string;
  targetIndex?: number;
  property?: string;
  zoneType?: string;
  zoneIndex?: number;
  coord?: string;
  required?: boolean;
}

interface DeviceProfile {
  id: string;
  label: string;
  model: string;
  manufacturer: string;
  entities: Record<string, ProfileEntity>;
  capabilities: {
    tracking: boolean;
    distanceOnlyTracking: boolean;
  };
}

interface MockDevice {
  name: string;
  profileId: string;
  profile: DeviceProfile;
}

interface EntityState {
  value: string;
  component: string;
  entityKey: string;
  objectId: string;
  stateTopic: string;
  commandTopic: string | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MQTT_BROKER = process.env.MQTT_BROKER ?? "mqtt://mosquitto:1883";
const PROFILE_DIR =
  process.env.PROFILE_DIR ?? "/config/device-profiles";
const COORDINATE_INTERVAL_MS = 2_000;
const RECONNECT_PERIOD_MS = 5_000;

const MOCK_DEVICES: Array<{ name: string; profileId: string }> = [
  { name: "mock_ep_lite_1", profileId: "everything_presence_lite" },
  { name: "mock_ep_lite_2", profileId: "everything_presence_lite" },
  { name: "mock_ep_one_1", profileId: "everything_presence_one" },
];

// Writable component types that need command topics
const WRITABLE_COMPONENTS = new Set([
  "number",
  "select",
  "switch",
  "text",
  "light",
]);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level: string, msg: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  console.log(JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Profile reader
// ---------------------------------------------------------------------------

function loadProfiles(): Map<string, DeviceProfile> {
  const profiles = new Map<string, DeviceProfile>();

  if (!existsSync(PROFILE_DIR)) {
    log("error", "Profile directory not found", { path: PROFILE_DIR });
    process.exit(1);
  }

  const files = readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    log("error", "No profile JSON files found", { path: PROFILE_DIR });
    process.exit(1);
  }

  for (const file of files) {
    const filePath = join(PROFILE_DIR, file);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const profile: DeviceProfile = JSON.parse(raw);
      profiles.set(profile.id, profile);
      log("info", "Loaded device profile", {
        profileId: profile.id,
        entityCount: Object.keys(profile.entities).length,
      });
    } catch (err) {
      log("error", "Failed to parse profile", {
        path: filePath,
        error: String(err),
      });
    }
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

/** Extract the HA component type from a template like "sensor.${name}_foo" */
function componentFromTemplate(template: string): string {
  return template.split(".")[0];
}

/** Resolve template: replace ${name} with device name, return the suffix after the dot */
function resolveObjectId(template: string, deviceName: string): string {
  const resolved = template.replace(/\$\{name\}/g, deviceName);
  return resolved.substring(resolved.indexOf(".") + 1);
}

/** Generate a human-readable label from a camelCase entity key */
function labelFromKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/(\d+)/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Get the default value for an entity based on its component type and profile data */
function defaultValue(
  component: string,
  entity: ProfileEntity,
  entityKey: string
): string {
  switch (component) {
    case "binary_sensor":
      return "OFF";
    case "switch":
      return "OFF";
    case "light":
      return "OFF";
    case "number":
      return String(entity.min ?? 0);
    case "select": {
      const firstOpt = entity.options?.[0] ?? "Default";
      // HA interprets MQTT payload "None" as null — use next option if first is "None"
      if (firstOpt === "None" && entity.options && entity.options.length > 1) {
        return entity.options[1];
      }
      return firstOpt;
    }
    case "text":
      return "";
    case "update":
      return JSON.stringify({
        installed_version: "1.0.0",
        latest_version: "1.0.0",
        title: entity.label ?? labelFromKey(entityKey),
        release_summary: "Up to date",
      });
    case "sensor": {
      // Return plausible defaults for environmental sensors
      if (entity.subcategory === "environment") {
        if (entityKey === "temperature") return "22.5";
        if (entityKey === "humidity") return "48";
        if (entityKey === "illuminance") return "250";
        if (entityKey === "co2") return "420";
      }
      return "0";
    }
    default:
      return "0";
  }
}

// ---------------------------------------------------------------------------
// Discovery message builder
// ---------------------------------------------------------------------------

interface DiscoveryPayload {
  unique_id: string;
  object_id: string;
  name: string;
  state_topic: string;
  command_topic?: string;
  device: {
    identifiers: string[];
    name: string;
    manufacturer: string;
    model: string;
  };
  availability_topic: string;
  // Type-specific fields
  min?: number;
  max?: number;
  step?: number;
  unit_of_measurement?: string;
  options?: string[];
  payload_on?: string;
  payload_off?: string;
  schema?: string;
  device_class?: string;
}

function buildDiscoveryPayload(
  device: MockDevice,
  entityKey: string,
  entity: ProfileEntity,
  component: string,
  objectId: string
): DiscoveryPayload {
  const stateTopic = `ep_mock/${device.name}/${entityKey}/state`;
  const isWritable = WRITABLE_COMPONENTS.has(component);

  const payload: DiscoveryPayload = {
    unique_id: `${device.name}_${entityKey}`,
    object_id: objectId,
    name: entity.label ?? labelFromKey(entityKey),
    state_topic: stateTopic,
    device: {
      identifiers: [device.name],
      name: device.name,
      manufacturer: device.profile.manufacturer,
      model: device.profile.model,
    },
    availability_topic: `ep_mock/${device.name}/availability`,
  };

  if (isWritable) {
    payload.command_topic = `ep_mock/${device.name}/${entityKey}/set`;
  }

  // Type-specific fields
  switch (component) {
    case "number":
      // Zone coordinate entities don't define min/max in profile — apply sensor range defaults
      if (entity.min !== undefined) {
        payload.min = entity.min;
      } else if (entity.category === "zone") {
        payload.min = -600;
      }
      if (entity.max !== undefined) {
        payload.max = entity.max;
      } else if (entity.category === "zone") {
        payload.max = 600;
      }
      payload.step = entity.step ?? 1;
      if (entity.unit) payload.unit_of_measurement = entity.unit;
      break;

    case "select":
      // HA MQTT discovery requires options for select entities
      payload.options = entity.options ?? ["Default"];
      break;

    case "binary_sensor":
      payload.payload_on = "ON";
      payload.payload_off = "OFF";
      // Set device_class for occupancy/presence sensors
      if (
        entity.subcategory === "presence" ||
        entity.subcategory === "zoneOccupancy"
      ) {
        payload.device_class = "occupancy";
      }
      break;

    case "switch":
      payload.payload_on = "ON";
      payload.payload_off = "OFF";
      break;

    case "light":
      payload.payload_on = "ON";
      payload.payload_off = "OFF";
      payload.schema = "basic";
      break;

    case "sensor":
      if (entity.unit) payload.unit_of_measurement = entity.unit;
      // Device classes for environmental sensors
      if (entity.subcategory === "environment") {
        if (entityKey === "temperature")
          payload.device_class = "temperature";
        if (entityKey === "humidity") payload.device_class = "humidity";
        if (entityKey === "illuminance")
          payload.device_class = "illuminance";
        if (entityKey === "co2")
          payload.device_class = "carbon_dioxide";
      }
      break;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

class DeviceStateManager {
  /** device name → entity key → EntityState */
  private state = new Map<string, Map<string, EntityState>>();

  init(device: MockDevice): void {
    const entityStates = new Map<string, EntityState>();
    const { entities } = device.profile;

    for (const [entityKey, entity] of Object.entries(entities)) {
      const component = componentFromTemplate(entity.template);
      const objectId = resolveObjectId(entity.template, device.name);
      const stateTopic = `ep_mock/${device.name}/${entityKey}/state`;
      const isWritable = WRITABLE_COMPONENTS.has(component);

      entityStates.set(entityKey, {
        value: defaultValue(component, entity, entityKey),
        component,
        entityKey,
        objectId,
        stateTopic,
        commandTopic: isWritable
          ? `ep_mock/${device.name}/${entityKey}/set`
          : null,
      });
    }

    this.state.set(device.name, entityStates);
  }

  get(deviceName: string, entityKey: string): EntityState | undefined {
    return this.state.get(deviceName)?.get(entityKey);
  }

  set(deviceName: string, entityKey: string, value: string): boolean {
    const es = this.state.get(deviceName)?.get(entityKey);
    if (!es) return false;
    es.value = value;
    return true;
  }

  getDeviceEntities(
    deviceName: string
  ): Map<string, EntityState> | undefined {
    return this.state.get(deviceName);
  }

  allDeviceNames(): string[] {
    return [...this.state.keys()];
  }
}

// ---------------------------------------------------------------------------
// Target coordinate cycling
// ---------------------------------------------------------------------------

interface TargetState {
  x: number;
  y: number;
  active: boolean;
}

class CoordinateCycler {
  private targets = new Map<string, TargetState[]>();
  private cycleCount = 0;

  init(deviceName: string, maxTargets: number): void {
    const targets: TargetState[] = [];
    for (let i = 0; i < maxTargets; i++) {
      targets.push({
        // Target 1 & 2 start at random positions, target 3 starts inactive
        x: i < 2 ? Math.round(Math.random() * 200 - 100) : 0,
        y: i < 2 ? Math.round(Math.random() * 300 + 100) : 0,
        active: i < 2,
      });
    }
    this.targets.set(deviceName, targets);
  }

  tick(
    deviceName: string,
    stateManager: DeviceStateManager,
    client: MqttClient
  ): void {
    const targets = this.targets.get(deviceName);
    if (!targets) return;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const targetNum = i + 1;

      if (t.active) {
        // Random walk: ±20cm per tick
        t.x = clamp(t.x + Math.round(Math.random() * 40 - 20), -300, 300);
        t.y = clamp(t.y + Math.round(Math.random() * 40 - 20), 0, 600);
      }

      const distance = Math.round(Math.sqrt(t.x * t.x + t.y * t.y));
      const angle = Math.round(
        (Math.atan2(t.x, t.y) * 180) / Math.PI
      );
      const speed = t.active ? Math.round(Math.random() * 100) : 0;
      const resolution = t.active ? Math.round(Math.random() * 50 + 10) : 0;

      // Publish each tracking property
      const updates: Array<[string, string]> = [
        [`target${targetNum}X`, String(t.x)],
        [`target${targetNum}Y`, String(t.y)],
        [`target${targetNum}Speed`, String(speed)],
        [`target${targetNum}Distance`, String(distance)],
        [`target${targetNum}Angle`, String(angle)],
        [`target${targetNum}Resolution`, String(resolution)],
        [`target${targetNum}Active`, t.active ? "ON" : "OFF"],
      ];

      for (const [key, value] of updates) {
        if (stateManager.set(deviceName, key, value)) {
          const es = stateManager.get(deviceName, key);
          if (es) {
            client.publish(es.stateTopic, value, { retain: true });
          }
        }
      }
    }

    // Update occupancy — ON if any target is active
    const anyActive = targets.some((t) => t.active);
    const occValue = anyActive ? "ON" : "OFF";
    if (stateManager.set(deviceName, "presence", occValue)) {
      const es = stateManager.get(deviceName, "presence");
      if (es) {
        client.publish(es.stateTopic, occValue, { retain: true });
      }
    }

    this.cycleCount++;
    if (this.cycleCount % 10 === 0) {
      log("info", "Coordinate cycle", { cycle: this.cycleCount, device: deviceName });
    }
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ---------------------------------------------------------------------------
// MQTT discovery publisher
// ---------------------------------------------------------------------------

async function publishDiscovery(
  client: MqttClient,
  devices: MockDevice[],
  stateManager: DeviceStateManager
): Promise<void> {
  for (const device of devices) {
    let count = 0;
    const { entities } = device.profile;

    for (const [entityKey, entity] of Object.entries(entities)) {
      const component = componentFromTemplate(entity.template);
      const objectId = resolveObjectId(entity.template, device.name);

      // Discovery topic
      const discoveryTopic = `homeassistant/${component}/${device.name}/${entityKey}/config`;

      // Build and publish discovery payload
      const payload = buildDiscoveryPayload(
        device,
        entityKey,
        entity,
        component,
        objectId
      );

      client.publish(discoveryTopic, JSON.stringify(payload), {
        retain: true,
      });
      count++;
    }

    // Publish device availability
    client.publish(`ep_mock/${device.name}/availability`, "online", {
      retain: true,
    });

    // Publish initial state values for all entities
    const entityStates = stateManager.getDeviceEntities(device.name);
    if (entityStates) {
      for (const [, es] of entityStates) {
        client.publish(es.stateTopic, es.value, { retain: true });
      }
    }

    log("info", `Published ${count} discovery messages for ${device.name}`, {
      device: device.name,
      entityCount: count,
      profileId: device.profileId,
    });
  }
}

// ---------------------------------------------------------------------------
// Command topic handler
// ---------------------------------------------------------------------------

function setupCommandHandler(
  client: MqttClient,
  stateManager: DeviceStateManager
): void {
  // Subscribe to all command topics
  client.subscribe("ep_mock/+/+/set", (err) => {
    if (err) {
      log("error", "Failed to subscribe to command topics", {
        error: String(err),
      });
    } else {
      log("info", "Subscribed to command topics", {
        pattern: "ep_mock/+/+/set",
      });
    }
  });

  client.on("message", (topic: string, message: Buffer) => {
    // Parse: ep_mock/{deviceName}/{entityKey}/set
    const parts = topic.split("/");
    if (parts.length !== 4 || parts[3] !== "set") return;

    const deviceName = parts[1];
    const entityKey = parts[2];
    const value = message.toString();

    const updated = stateManager.set(deviceName, entityKey, value);
    if (updated) {
      const es = stateManager.get(deviceName, entityKey);
      if (es) {
        // Echo back to state topic
        client.publish(es.stateTopic, value, { retain: true });
        log("info", "Command received — state updated", {
          device: deviceName,
          entity: entityKey,
          value,
        });
      }
    } else {
      log("warn", "Command for unknown entity", {
        device: deviceName,
        entity: entityKey,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("info", "EP Mock Devices starting", {
    broker: MQTT_BROKER,
    profileDir: PROFILE_DIR,
    devices: MOCK_DEVICES.map((d) => d.name),
  });

  // 1. Load profiles
  const profiles = loadProfiles();

  // Validate all required profiles exist
  const devices: MockDevice[] = [];
  for (const def of MOCK_DEVICES) {
    const profile = profiles.get(def.profileId);
    if (!profile) {
      log("error", "Required profile not found", {
        profileId: def.profileId,
        available: [...profiles.keys()],
      });
      process.exit(1);
    }
    devices.push({ name: def.name, profileId: def.profileId, profile });
  }

  // 2. Initialize state manager
  const stateManager = new DeviceStateManager();
  for (const device of devices) {
    stateManager.init(device);
  }

  // 3. Connect to MQTT
  const client = mqtt.connect(MQTT_BROKER, {
    clientId: "ep-mock-devices",
    clean: true,
    reconnectPeriod: RECONNECT_PERIOD_MS,
    will: {
      topic: "ep_mock/mock_ep_lite_1/availability",
      payload: Buffer.from("offline"),
      retain: true,
      qos: 1,
    },
  });

  let connected = false;
  let retryCount = 0;

  client.on("connect", async () => {
    connected = true;
    retryCount = 0;
    log("info", "Connected to MQTT broker", { broker: MQTT_BROKER });

    // 4. Publish discovery + initial states
    await publishDiscovery(client, devices, stateManager);

    // 5. Set up command topic handler
    setupCommandHandler(client, stateManager);

    // 6. Start coordinate cycling for EP Lite devices (which have tracking)
    const cycler = new CoordinateCycler();
    const trackingDevices = devices.filter(
      (d) => d.profile.capabilities.tracking
    );

    for (const device of trackingDevices) {
      const maxTargets = 3; // EP Lite has 3 targets
      cycler.init(device.name, maxTargets);
      log("info", "Initialized coordinate cycler", {
        device: device.name,
        targets: maxTargets,
      });
    }

    // Cycle coordinates every N ms
    setInterval(() => {
      if (!connected) return;
      for (const device of trackingDevices) {
        cycler.tick(device.name, stateManager, client);
      }
    }, COORDINATE_INTERVAL_MS);

    // Also publish environment sensor updates for EP One (less frequent)
    const epOneDevices = devices.filter(
      (d) => d.profile.capabilities.distanceOnlyTracking
    );
    setInterval(() => {
      if (!connected) return;
      for (const device of epOneDevices) {
        // Simulate slow-changing distance
        const dist = Math.round(50 + Math.random() * 200);
        const speed = Math.round(Math.random() * 30);
        const energy = Math.round(20 + Math.random() * 80);

        const updates: Array<[string, string]> = [
          ["distance", String(dist)],
          ["speed", String(speed)],
          ["energy", String(energy)],
          ["targetCount", String(Math.random() > 0.3 ? 1 : 0)],
          ["presence", "ON"],
          ["mmwave", "ON"],
        ];

        for (const [key, value] of updates) {
          if (stateManager.set(device.name, key, value)) {
            const es = stateManager.get(device.name, key);
            if (es) {
              client.publish(es.stateTopic, value, { retain: true });
            }
          }
        }
      }
    }, 3_000);

    log("info", "Mock devices fully initialized", {
      totalDevices: devices.length,
      totalEntities: devices.reduce(
        (sum, d) => sum + Object.keys(d.profile.entities).length,
        0
      ),
    });
  });

  client.on("reconnect", () => {
    retryCount++;
    log("warn", "MQTT reconnecting", { retryCount, broker: MQTT_BROKER });
  });

  client.on("disconnect", () => {
    connected = false;
    log("warn", "MQTT disconnected");
  });

  client.on("error", (err: Error) => {
    log("error", "MQTT error", { error: err.message, retryCount });
  });

  client.on("offline", () => {
    connected = false;
    log("warn", "MQTT client offline");
  });

  // Graceful shutdown
  const shutdown = () => {
    log("info", "Shutting down...");
    // Publish offline availability for all devices
    for (const device of devices) {
      client.publish(
        `ep_mock/${device.name}/availability`,
        "offline",
        { retain: true },
        () => {}
      );
    }
    setTimeout(() => {
      client.end(false, () => process.exit(0));
    }, 500);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log("error", "Fatal error", { error: String(err) });
  process.exit(1);
});
