# EP Dev Stack

Self-contained development environment for the Everything Presence mmWave Configurator. Launches Home Assistant, an MQTT broker, 3 mock EP devices, and the configurator — no real hardware required.

## Quick Start

**Prerequisites:** Docker and Docker Compose (v2+).

```bash
# From the repo root:
docker compose -f dev/docker-compose.dev.yaml up
```

First start takes ~60–90 seconds. The stack is ready when you see logs from `mock-devices` showing "Mock devices fully initialized".

| Service | URL |
|---------|-----|
| Configurator | http://localhost:42069 |
| Home Assistant | http://localhost:18123 |
| MQTT Broker | `localhost:1883` |

HA credentials: `dev` / `devpassword`

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Docker Network                      │
│                                                       │
│  ┌──────────────┐     ┌──────────────┐               │
│  │ Mosquitto    │◄────│ mock-devices │               │
│  │ MQTT :1883   │     │ (3 EP devs)  │               │
│  └──────┬───────┘     └──────────────┘               │
│         │ MQTT                                        │
│         ▼                                             │
│  ┌──────────────┐     ┌──────────────┐               │
│  │ Home         │     │ ha-bootstrap │               │
│  │ Assistant    │◄────│ (onboarding  │               │
│  │ :8123        │     │  + token)    │               │
│  └──────┬───────┘     └──────┬───────┘               │
│         │ REST/WS API        │ writes token           │
│         ▼                    ▼                        │
│  ┌──────────────────────────────────────┐            │
│  │ shared-tokens volume                  │            │
│  │   /shared/ha-token                    │            │
│  └──────────────────┬───────────────────┘            │
│                     │ reads token                     │
│                     ▼                                 │
│  ┌──────────────────────────────────────┐            │
│  │ Configurator                          │            │
│  │ :42069 (web UI + API)                 │            │
│  └──────────────────────────────────────┘            │
└──────────────────────────────────────────────────────┘
```

## Services

### Home Assistant (`homeassistant`)

Core home automation platform. MQTT integration is configured automatically by the bootstrap service.

- **Port:** `18123` (maps to internal `8123`)
- **Image:** `ghcr.io/home-assistant/home-assistant:2026.2`
- **Health check:** Polls `/api/onboarding` every 5s

### Mosquitto (`mosquitto`)

MQTT broker used for mock device communication. Anonymous access enabled (dev only).

- **Port:** `1883`
- **Image:** `eclipse-mosquitto:2`
- **Health check:** Subscribes to `$SYS/#` topic

### HA Bootstrap (`ha-bootstrap`)

One-shot service that:
1. Waits for HA to be healthy
2. Completes the onboarding flow (creates dev user)
3. Configures the MQTT integration pointing at Mosquitto
4. Creates a long-lived access token via WebSocket
5. Writes the token to `/shared/ha-token` in the shared volume

Runs once and exits. On subsequent starts with existing data, it detects onboarding is already done and validates the existing token.

- **Exit codes:** 0 (success), 1 (HA unreachable), 2 (onboarding failed), 3 (auth failed), 4 (token failed), 5 (MQTT setup failed)

### Mock Devices (`mock-devices`)

Node.js/TypeScript sidecar that publishes MQTT auto-discovery messages to create 3 mock EP devices in Home Assistant:

| Device | Profile | Entities |
|--------|---------|----------|
| `mock_ep_lite_1` | Everything Presence Lite | ~72 |
| `mock_ep_lite_2` | Everything Presence Lite | ~72 |
| `mock_ep_one_1` | Everything Presence One | ~72 |

**Total:** ~216 entities across 3 devices.

EP Lite devices cycle target coordinates every 2 seconds (random walk: x ±300cm, y 0–600cm). EP One devices simulate distance-only tracking.

All writable entities (number, select, switch, text) accept commands via MQTT and echo values back to their state topics.

- **MQTT topic convention:**
  - State: `ep_mock/{device_name}/{entityKey}/state`
  - Command: `ep_mock/{device_name}/{entityKey}/set`
  - Discovery: `homeassistant/{component}/{device_name}/{entityKey}/config`

### Configurator (`configurator`)

Built from the local source code (`everything-presence-mmwave-configurator/Dockerfile`, standalone target). Reads the bootstrapped token and connects to HA to discover mock devices.

- **Port:** `42069`
- **Env:** `HA_BASE_URL`, `HA_LONG_LIVED_TOKEN_FILE`

## Verification

Run the automated verification script to prove the full stack works:

```bash
# Full cycle: start → check → cleanup
bash dev/scripts/verify-stack.sh

# Leave stack running for manual inspection
bash dev/scripts/verify-stack.sh --no-cleanup
```

The script checks:

1. **HA API responds** — HTTP 200 with the bootstrapped token
2. **HA device registry** — ≥3 EP devices with correct manufacturer
3. **Configurator /api/devices** — lists mock devices
4. **Target entity state** — `sensor.mock_ep_lite_1_target_1_x` has a numeric value

On failure, it dumps logs for the failing service.

## Developing

### Rebuild after code changes

```bash
# Rebuild just the configurator
docker compose -f dev/docker-compose.dev.yaml build configurator

# Rebuild and restart
docker compose -f dev/docker-compose.dev.yaml up -d --build configurator
```

### View logs

```bash
# All services
docker compose -f dev/docker-compose.dev.yaml logs -f

# Specific service
docker compose -f dev/docker-compose.dev.yaml logs -f configurator
docker compose -f dev/docker-compose.dev.yaml logs -f mock-devices
docker compose -f dev/docker-compose.dev.yaml logs -f ha-bootstrap
```

### Restart individual services

```bash
docker compose -f dev/docker-compose.dev.yaml restart configurator
docker compose -f dev/docker-compose.dev.yaml restart mock-devices
```

### Inspect MQTT traffic

```bash
# All mock device traffic
docker exec ep-dev-mosquitto mosquitto_sub -t 'ep_mock/#'

# Discovery messages only
docker exec ep-dev-mosquitto mosquitto_sub -t 'homeassistant/#'
```

### Query HA API directly

```bash
# Read the bootstrapped token
TOKEN=$(docker run --rm -v dev_shared-tokens:/shared alpine:3.19 cat /shared/ha-token)

# List all states
curl -H "Authorization: Bearer $TOKEN" http://localhost:18123/api/states | python3 -m json.tool

# Check a specific entity
curl -H "Authorization: Bearer $TOKEN" http://localhost:18123/api/states/sensor.mock_ep_lite_1_target_1_x

# List config entries (verify MQTT)
curl -H "Authorization: Bearer $TOKEN" http://localhost:18123/api/config/config_entries/entry
```

### Clean shutdown

```bash
# Stop and remove all containers and volumes
docker compose -f dev/docker-compose.dev.yaml down -v
```

## Environment Variables

Defined in `dev/.env.dev`. Override by creating `dev/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `HA_PORT` | `18123` | Host port for Home Assistant |
| `HA_IMAGE` | `ghcr.io/home-assistant/home-assistant:2026.2` | HA Docker image |
| `MQTT_PORT` | `1883` | Host port for MQTT broker |
| `CONFIGURATOR_PORT` | `42069` | Host port for configurator |
| `HA_DEV_USERNAME` | `dev` | Bootstrap user username |
| `HA_DEV_PASSWORD` | `devpassword` | Bootstrap user password |
| `HA_DEV_NAME` | `Developer` | Bootstrap user display name |

## Troubleshooting

### Bootstrap fails / times out

**Symptom:** `ha-bootstrap` exits with a non-zero code or never completes.

**Causes:**
- HA is slow to start (especially first boot when downloading components)
- HA healthcheck hasn't passed yet

**Fix:** Check bootstrap logs: `docker compose -f dev/docker-compose.dev.yaml logs ha-bootstrap`. The bootstrap service waits up to 120s for HA. If HA is still initializing, increase the HA healthcheck `start_period` in the compose file or restart the bootstrap: `docker compose -f dev/docker-compose.dev.yaml restart ha-bootstrap`.

### Entities show "unavailable" or "unknown"

**Symptom:** Mock device entities exist in HA but show "unavailable" or "unknown" state.

**Causes:**
- Mosquitto isn't ready yet when mock-devices starts publishing
- HA's MQTT integration hasn't finished processing discovery messages

**Fix:** Wait 15–30 seconds for HA to process all MQTT discovery messages. Check mock-devices logs: `docker compose -f dev/docker-compose.dev.yaml logs mock-devices`. If MQTT connection errors appear, restart mock-devices: `docker compose -f dev/docker-compose.dev.yaml restart mock-devices`.

### Configurator can't discover devices

**Symptom:** Configurator UI shows no devices or `/api/devices` returns empty.

**Causes:**
- Token file not yet written (bootstrap hasn't completed)
- Configurator started before HA was ready
- HA WebSocket transport not connecting

**Fix:** Check if bootstrap completed: `docker compose -f dev/docker-compose.dev.yaml ps ha-bootstrap`. Check configurator logs for connection errors: `docker compose -f dev/docker-compose.dev.yaml logs configurator`. Restart configurator after bootstrap completes: `docker compose -f dev/docker-compose.dev.yaml restart configurator`.

### Port conflicts

**Symptom:** `bind: address already in use`

**Fix:** Change ports in `dev/.env.dev` or set environment variables:
```bash
HA_PORT=28123 CONFIGURATOR_PORT=52069 docker compose -f dev/docker-compose.dev.yaml up
```

### Stale state from previous run

**Symptom:** Bootstrap detects onboarding already done but token is invalid.

**Fix:** Remove all volumes and restart:
```bash
docker compose -f dev/docker-compose.dev.yaml down -v
docker compose -f dev/docker-compose.dev.yaml up
```

## Connecting Real Devices

The dev stack can optionally be used with real EP devices on your LAN. To enable mDNS discovery of real devices:

1. Set `network_mode: host` on the configurator service in `docker-compose.dev.yaml`
2. Remove the `ports:` mapping for the configurator (host networking uses host ports directly)
3. Ensure your real EP devices are on the same LAN as the Docker host

**Note:** This is opt-in and not the default. The default stack uses mock devices only, which require no hardware.
