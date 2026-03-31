---
estimated_steps: 34
estimated_files: 3
skills_used: []
---

# T03: Wire MqttClient into server and integrate lifecycle into routes

Connect the lifecycle orchestrator to the running server: instantiate MqttClient at startup, extend RoomsRouterDependencies, hook room device creation into the apply-zones flow, and add cleanup to the DELETE route.

## Steps

1. **MqttClient in `index.ts`** (`backend/src/index.ts`): After creating readTransport and profileLoader, check `config.mqtt`. If present, create a `MqttClient(config.mqtt)`, call `await mqttClient.connect()`, and log success. If MQTT config is absent, log info and continue without MQTT — room device lifecycle will be a no-op. Pass mqttClient into `createServer` deps.

2. **Extend ServerDependencies and RoomsRouterDependencies** (`backend/src/server.ts`, `backend/src/routes/rooms.ts`):
   - Add `mqttClient?: MqttClient` and `readTransport?: IHaReadTransport` to `RoomsRouterDependencies`
   - In `createServer`, pass `mqttClient: deps?.mqttClient` and `readTransport: deps?.readTransport` into roomsDeps
   - Add `mqttClient?: MqttClient` to `ServerDependencies`
   - In `index.ts`, include mqttClient in the deps passed to `createServer`

3. **Lifecycle integration in apply-zones route** (`backend/src/routes/rooms.ts`):
   - After the existing `orchestrator.applyRoomZones(room)` call succeeds, check if `deps.mqttClient` is available
   - If yes: import and call `createOrUpdateRoomDevice(room, assignmentResults, lifecycleDeps)` where assignmentResults come from the orchestrator result's assignment data
   - The apply-zones route currently returns the orchestrator result — extend the response to include `roomDevice: { created: boolean, warnings: string[] }` or `roomDevice: null` when MQTT unavailable
   - **Key detail**: The orchestrator result doesn't directly expose `ZoneAssignment[]` — it returns `DeviceWriteResult[]` with `assignedZoneIds`. The lifecycle orchestrator needs the full assignment data. Solution: run `assignZonesToDevices` in the route handler (or refactor to expose assignments). Better approach: run the zone assignment engine directly in the route to get both the write results AND the assignment data, then pass assignments to the lifecycle orchestrator.
   - **Revised approach**: Import `computeAllCoverage` and `assignZonesToDevices` into the route handler. After the existing orchestrator call, run assignment independently to get `ZoneAssignment[]` for the lifecycle orchestrator. This avoids modifying the existing orchestrator's return type. The coverage + assignment computation is pure and fast — running it twice is fine.

4. **DELETE route cleanup** (`backend/src/routes/rooms.ts`):
   - In the DELETE handler, before calling `storage.deleteRoom()`, capture `room.zones.length`
   - If `deps.mqttClient` is available, create `RoomDeviceService` and call `removeRoomDevice(roomId, zoneCount)`
   - Wrap in try/catch — cleanup failure should not prevent room deletion (log warning, continue)

5. **Type check + full test suite**:
   - `cd backend && npx tsc --noEmit` — 0 new errors
   - `npx vitest run` — ≥246 tests passing, 0 regressions

## Must-Haves

- [ ] MqttClient created and connected at startup when `config.mqtt` present
- [ ] Server starts normally when `config.mqtt` is absent (no MQTT, no crash)
- [ ] Apply-zones triggers room device creation after successful zone writes
- [ ] DELETE route cleans up room device before removing from storage
- [ ] Cleanup failure in DELETE is non-fatal (logs warning, room still deleted)
- [ ] All 246+ existing tests still pass

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| MQTT broker | Log error, skip room device creation — zone writes still succeed | MqttClient.connect() has 10s timeout, server startup fails if MQTT configured but unreachable | N/A — we control the publish payload |
| deviceEntityService.getEntityId | Returns null → skip that sensor → warning in response | N/A (synchronous lookup) | N/A |
| RoomDeviceService.createRoomDevice | Catch, log error, include in response warnings — zone writes already succeeded | MQTT publish timeout from underlying client | N/A |

## Inputs

- ``everything-presence-mmwave-configurator/backend/src/domain/roomDeviceLifecycle.ts` — lifecycle orchestrator from T02`
- ``everything-presence-mmwave-configurator/backend/src/ha/mqttClient.ts` — MqttClient class (S02)`
- ``everything-presence-mmwave-configurator/backend/src/ha/roomDeviceService.ts` — RoomDeviceService class (S02)`
- ``everything-presence-mmwave-configurator/backend/src/config.ts` — AppConfig with optional mqtt field`
- ``everything-presence-mmwave-configurator/backend/src/index.ts` — server bootstrap to extend with MqttClient`
- ``everything-presence-mmwave-configurator/backend/src/server.ts` — createServer + ServerDependencies to extend`
- ``everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — rooms router to hook lifecycle into`
- ``everything-presence-mmwave-configurator/backend/src/domain/zoneAssignment.ts` — assignZonesToDevices, computeAllCoverage for re-running assignment in route`
- ``everything-presence-mmwave-configurator/backend/src/domain/zoneCoverage.ts` — computeAllCoverage`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/index.ts` — MqttClient creation + connection at startup`
- ``everything-presence-mmwave-configurator/backend/src/server.ts` — extended ServerDependencies with mqttClient`
- ``everything-presence-mmwave-configurator/backend/src/routes/rooms.ts` — lifecycle hooks in apply-zones and DELETE`

## Verification

cd everything-presence-mmwave-configurator/backend && npx tsc --noEmit && cd .. && npx vitest run

## Observability Impact

MqttClient connection status logged at startup. Room device create/remove logged via existing RoomDeviceService pino logs. Lifecycle orchestrator warnings surfaced in apply-zones API response. DELETE cleanup failures logged as warnings.
