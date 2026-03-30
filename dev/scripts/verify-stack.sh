#!/usr/bin/env bash
##
# verify-stack.sh — End-to-end verification of the EP dev stack
#
# Brings up the full Docker-compose stack, waits for all services to be
# healthy, and runs 4 checks that prove the stack works as a unit:
#
#   Check 1: HA API responds with 200 using the bootstrapped token
#   Check 2: HA device registry contains ≥3 EP devices
#   Check 3: Configurator /api/devices lists mock devices
#   Check 4: A target coordinate entity has a numeric state value
#
# Usage:
#   bash dev/scripts/verify-stack.sh              # run checks + cleanup
#   bash dev/scripts/verify-stack.sh --no-cleanup  # leave stack running
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
##

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEV_DIR}/docker-compose.dev.yaml"
COMPOSE_CMD="docker compose -f ${COMPOSE_FILE} --profile full"

HA_URL="http://localhost:${HA_PORT:-18123}"
CONFIGURATOR_URL="http://localhost:${CONFIGURATOR_PORT:-42069}"
TOKEN_VOLUME="dev_shared-tokens"
TOKEN_FILE="/shared/ha-token"

MAX_WAIT=180        # seconds to wait for full stack readiness
POLL_INTERVAL=5     # seconds between health polls

CLEANUP=true
for arg in "$@"; do
  case "$arg" in
    --no-cleanup) CLEANUP=false ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
TOTAL=4
FAILED_SERVICES=()

log() { echo -e "${CYAN}[verify]${NC} $1"; }
pass() { echo -e "  ${GREEN}✓ PASS${NC}: $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "  ${RED}✗ FAIL${NC}: $1 — $2"; FAILED=$((FAILED + 1)); FAILED_SERVICES+=("${3:-}"); }
warn() { echo -e "  ${YELLOW}⚠ WARN${NC}: $1"; }

cleanup() {
  if [ "$CLEANUP" = true ]; then
    log "Cleaning up — stopping stack and removing volumes..."
    $COMPOSE_CMD down -v --remove-orphans 2>/dev/null || true
    log "Cleanup complete."
  else
    log "Stack left running (--no-cleanup). Clean up with:"
    echo "  $COMPOSE_CMD down -v"
  fi
}

dump_service_logs() {
  local service="$1"
  echo ""
  echo -e "${YELLOW}--- Logs for ${service} ---${NC}"
  $COMPOSE_CMD logs --tail=80 "$service" 2>/dev/null || echo "(no logs)"
  echo -e "${YELLOW}--- End logs for ${service} ---${NC}"
  echo ""
}

# ---------------------------------------------------------------------------
# Step 1: Start the stack
# ---------------------------------------------------------------------------

log "Starting EP dev stack..."
$COMPOSE_CMD down -v --remove-orphans 2>/dev/null || true
$COMPOSE_CMD up -d --build 2>&1

log "Waiting for all services to become healthy (max ${MAX_WAIT}s)..."

elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  # Check if ha-bootstrap completed (-a includes stopped containers)
  BOOTSTRAP_JSON=$($COMPOSE_CMD ps -a --format json ha-bootstrap 2>/dev/null || echo "{}")
  BOOTSTRAP_STATE=$(echo "$BOOTSTRAP_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('State','unknown'))" 2>/dev/null || echo "unknown")
  BOOTSTRAP_EXIT_CODE=$(echo "$BOOTSTRAP_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('ExitCode',''))" 2>/dev/null || echo "")

  if [ "$BOOTSTRAP_STATE" = "exited" ]; then
    if [ "$BOOTSTRAP_EXIT_CODE" = "0" ]; then
      log "Bootstrap completed successfully (${elapsed}s)"
      break
    else
      log "Bootstrap exited with error (exit code ${BOOTSTRAP_EXIT_CODE})"
      dump_service_logs "ha-bootstrap"
      cleanup
      exit 1
    fi
  fi

  sleep "$POLL_INTERVAL"
  elapsed=$((elapsed + POLL_INTERVAL))

  if [ $((elapsed % 30)) -eq 0 ]; then
    log "Still waiting... (${elapsed}s elapsed)"
  fi
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
  log "Timed out waiting for stack readiness after ${MAX_WAIT}s"
  $COMPOSE_CMD ps -a
  dump_service_logs "ha-bootstrap"
  cleanup
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Read the bootstrapped token
# ---------------------------------------------------------------------------

log "Reading bootstrapped token from shared volume..."
TOKEN=$(docker run --rm -v "${TOKEN_VOLUME}:${TOKEN_FILE%/*}" alpine:3.19 cat "$TOKEN_FILE" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  log "ERROR: Could not read token from volume ${TOKEN_VOLUME}"
  dump_service_logs "ha-bootstrap"
  cleanup
  exit 1
fi

log "Token obtained (${#TOKEN} chars)"

# Wait a bit for mock-devices to publish discovery and for HA to process entities
log "Waiting for mock devices to publish discovery and HA to process entities..."
sleep 15

# ---------------------------------------------------------------------------
# Check 1: HA API responds
# ---------------------------------------------------------------------------

log "Running checks..."
echo ""

HA_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${HA_URL}/api/" 2>/dev/null || echo "000")

if [ "$HA_STATUS" = "200" ]; then
  pass "HA API responds (HTTP ${HA_STATUS})"
else
  fail "HA API responds" "expected HTTP 200, got ${HA_STATUS}" "homeassistant"
fi

# ---------------------------------------------------------------------------
# Check 2: HA device registry contains ≥3 EP devices
# ---------------------------------------------------------------------------

# Use the HA WebSocket API via a python helper to list devices
EP_DEVICE_COUNT=$(python3 -c "
import json, socket, struct, os, sys, base64

ha_host = 'localhost'
ha_port = int(os.environ.get('HA_PORT', '18123'))
token = '''${TOKEN}'''

def recv_ws_frame(s):
    header = s.recv(2)
    if len(header) < 2:
        return None
    payload_len = header[1] & 0x7f
    if payload_len == 126:
        payload_len = struct.unpack('>H', s.recv(2))[0]
    elif payload_len == 127:
        payload_len = struct.unpack('>Q', s.recv(8))[0]
    data = b''
    while len(data) < payload_len:
        chunk = s.recv(payload_len - len(data))
        if not chunk:
            break
        data += chunk
    return data.decode()

def send_ws_frame(s, msg):
    data = msg.encode()
    frame = bytearray()
    frame.append(0x81)
    mask_key = os.urandom(4)
    length = len(data)
    if length < 126:
        frame.append(0x80 | length)
    elif length < 65536:
        frame.append(0x80 | 126)
        frame.extend(struct.pack('>H', length))
    else:
        frame.append(0x80 | 127)
        frame.extend(struct.pack('>Q', length))
    frame.extend(mask_key)
    masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(data))
    frame.extend(masked)
    s.sendall(frame)

try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(15)
    sock.connect((ha_host, ha_port))

    key = base64.b64encode(os.urandom(16)).decode()
    handshake = (
        f'GET /api/websocket HTTP/1.1\r\n'
        f'Host: {ha_host}:{ha_port}\r\n'
        f'Upgrade: websocket\r\n'
        f'Connection: Upgrade\r\n'
        f'Sec-WebSocket-Key: {key}\r\n'
        f'Sec-WebSocket-Version: 13\r\n'
        f'\r\n'
    )
    sock.sendall(handshake.encode())

    response = b''
    while b'\r\n\r\n' not in response:
        response += sock.recv(4096)

    msg = recv_ws_frame(sock)
    auth_req = json.loads(msg)
    assert auth_req['type'] == 'auth_required'

    send_ws_frame(sock, json.dumps({
        'type': 'auth',
        'access_token': token
    }))

    msg = recv_ws_frame(sock)
    auth_result = json.loads(msg)
    assert auth_result['type'] == 'auth_ok'

    send_ws_frame(sock, json.dumps({
        'id': 1,
        'type': 'config/device_registry/list'
    }))

    msg = recv_ws_frame(sock)
    result = json.loads(msg)
    assert result.get('success'), f'Device list failed: {msg}'

    devices = result.get('result', [])
    ep_devices = [
        d for d in devices
        if (d.get('manufacturer') or '').lower() in [
            'everythingsmarttechnology',
            'everything smart technology'
        ]
    ]

    # Print count and names for diagnostics
    for d in ep_devices:
        print(f\"DEVICE:{d.get('name', 'unknown')}:{d.get('id', 'unknown')}\", file=sys.stderr)

    print(len(ep_devices))
    sock.close()
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    print('0')
" 2>/tmp/verify_devices.log)

DEVICE_NAMES=$(grep "^DEVICE:" /tmp/verify_devices.log 2>/dev/null | sed 's/^DEVICE:/  - /' || true)

if [ "$EP_DEVICE_COUNT" -ge 3 ] 2>/dev/null; then
  pass "HA device registry has ${EP_DEVICE_COUNT} EP devices"
  if [ -n "$DEVICE_NAMES" ]; then
    echo "$DEVICE_NAMES"
  fi
else
  fail "HA device registry has ≥3 EP devices" "found ${EP_DEVICE_COUNT}" "mock-devices"
  if [ -n "$DEVICE_NAMES" ]; then
    echo "$DEVICE_NAMES"
  fi
  DIAG=$(cat /tmp/verify_devices.log 2>/dev/null || echo "(no diagnostics)")
  warn "Device query diagnostics: ${DIAG}"
fi

# ---------------------------------------------------------------------------
# Check 3: Configurator /api/devices lists devices
# ---------------------------------------------------------------------------

# Wait for configurator to be ready (it may still be connecting to HA)
CONFIGURATOR_READY=false
for i in $(seq 1 12); do
  CFG_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "${CONFIGURATOR_URL}/api/devices" 2>/dev/null || echo "000")
  if [ "$CFG_STATUS" = "200" ]; then
    CONFIGURATOR_READY=true
    break
  fi
  sleep 5
done

if [ "$CONFIGURATOR_READY" = true ]; then
  DEVICES_JSON=$(curl -sf "${CONFIGURATOR_URL}/api/devices" 2>/dev/null || echo "{}")
  DEVICE_LIST_COUNT=$(echo "$DEVICES_JSON" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    devices = data.get('devices', [])
    print(len(devices))
except:
    print('0')
" 2>/dev/null)

  if [ "$DEVICE_LIST_COUNT" -ge 1 ] 2>/dev/null; then
    pass "Configurator /api/devices lists ${DEVICE_LIST_COUNT} devices"
  else
    fail "Configurator /api/devices lists devices" "found ${DEVICE_LIST_COUNT} (expected ≥1)" "configurator"
  fi
else
  fail "Configurator /api/devices lists devices" "configurator not responding (HTTP ${CFG_STATUS})" "configurator"
fi

# ---------------------------------------------------------------------------
# Check 4: Target entity has numeric state
# ---------------------------------------------------------------------------

ENTITY_ID="sensor.mock_ep_lite_1_target_1_x"
ENTITY_STATE=$(curl -sf \
  -H "Authorization: Bearer ${TOKEN}" \
  "${HA_URL}/api/states/${ENTITY_ID}" 2>/dev/null || echo "{}")

STATE_VALUE=$(echo "$ENTITY_STATE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    state = data.get('state', 'unknown')
    print(state)
except:
    print('unknown')
" 2>/dev/null)

# Check if it's a number (possibly negative, possibly float)
if echo "$STATE_VALUE" | grep -qE '^-?[0-9]+\.?[0-9]*$'; then
  pass "Target entity ${ENTITY_ID} has numeric state: ${STATE_VALUE}"
else
  fail "Target entity ${ENTITY_ID} has numeric state" "got '${STATE_VALUE}'" "mock-devices"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "========================================"
echo "  Verification Summary"
echo "========================================"
echo -e "  Passed: ${GREEN}${PASSED}${NC} / ${TOTAL}"
echo -e "  Failed: ${RED}${FAILED}${NC} / ${TOTAL}"
echo "========================================"
echo ""

# Dump logs for failing services
if [ "$FAILED" -gt 0 ]; then
  # Deduplicate failing services
  UNIQUE_SERVICES=($(echo "${FAILED_SERVICES[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' '))
  for svc in "${UNIQUE_SERVICES[@]}"; do
    if [ -n "$svc" ]; then
      dump_service_logs "$svc"
    fi
  done
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup

if [ "$FAILED" -gt 0 ]; then
  exit 1
fi

log "All checks passed!"
exit 0
