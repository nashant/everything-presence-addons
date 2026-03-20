#!/bin/sh
##
# bootstrap-ha.sh — Programmatic HA onboarding + MQTT setup + long-lived token
#
# Completes the HA onboarding flow without manual interaction:
#   1. Waits for HA to become reachable
#   2. Checks if onboarding is already done (idempotent)
#   3. Creates dev user via onboarding API
#   4. Exchanges auth code for access + refresh tokens
#   5. Completes remaining onboarding steps
#   6. Sets up MQTT integration pointing at mosquitto service
#   7. Creates a long-lived access token via WebSocket
#   8. Writes token to /shared/ha-token
#
# Environment:
#   HA_URL             - HA base URL (default: http://homeassistant:8123)
#   HA_DEV_USERNAME    - dev user username (default: dev)
#   HA_DEV_PASSWORD    - dev user password (default: devpassword)
#   HA_DEV_NAME        - dev user display name (default: Developer)
#
# Exit codes:
#   0 — success (token written or already exists from prior run)
#   1 — HA not reachable after timeout
#   2 — onboarding failed
#   3 — authentication failed
#   4 — long-lived token creation failed
#   5 — MQTT setup failed
##

set -e

# ---------- Config ----------
HA_URL="${HA_URL:-http://homeassistant:8123}"
USERNAME="${HA_DEV_USERNAME:-dev}"
PASSWORD="${HA_DEV_PASSWORD:-devpassword}"
NAME="${HA_DEV_NAME:-Developer}"
CLIENT_ID="http://ep-dev-bootstrap"
TOKEN_FILE="/shared/ha-token"
MAX_WAIT=120

# Install dependencies
apk add --no-cache curl python3 > /dev/null 2>&1 || true

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
}

# ---------- Step 1: Wait for HA ----------
log "Waiting for Home Assistant at ${HA_URL}..."
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  # Check if HA is reachable (either onboarding API or root page)
  if curl -sf "${HA_URL}/api/onboarding" > /dev/null 2>&1; then
    log "Home Assistant is reachable via onboarding API (${elapsed}s)"
    break
  fi
  if curl -sf -o /dev/null "${HA_URL}/" 2>&1; then
    log "Home Assistant is reachable via root URL (${elapsed}s)"
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
  log "ERROR: Home Assistant not reachable after ${MAX_WAIT}s"
  exit 1
fi

# ---------- Step 2: Check onboarding status ----------
ONBOARDING=$(curl -s "${HA_URL}/api/onboarding" 2>&1) || true
ONBOARD_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${HA_URL}/api/onboarding" 2>/dev/null || echo "000")
log "Onboarding status (HTTP ${ONBOARD_HTTP}): ${ONBOARDING}"

# If onboarding endpoint returns 404 or non-200, HA is already fully onboarded
ALREADY_ONBOARDED="false"
if [ "$ONBOARD_HTTP" = "404" ] || [ "$ONBOARD_HTTP" = "401" ]; then
  ALREADY_ONBOARDED="true"
fi

USER_DONE=$(echo "$ONBOARDING" | grep -o '"step":"user","done":true' || true)

if [ "$ALREADY_ONBOARDED" = "true" ] || [ -n "$USER_DONE" ]; then
  log "Onboarding user step already completed"
  if [ -f "$TOKEN_FILE" ] && [ -s "$TOKEN_FILE" ]; then
    log "Token file already exists at ${TOKEN_FILE} — validating..."
    EXISTING_TOKEN=$(cat "$TOKEN_FILE")
    VALIDATE=$(curl -sf -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${EXISTING_TOKEN}" \
      "${HA_URL}/api/" 2>/dev/null || echo "000")
    if [ "$VALIDATE" = "200" ]; then
      log "Existing token is valid. Bootstrap complete (idempotent skip)."
      exit 0
    else
      log "WARNING: Existing token is invalid (HTTP ${VALIDATE})."
      log "Delete HA data volume and restart to re-bootstrap."
      exit 0
    fi
  else
    log "WARNING: No token file found but onboarding already done."
    log "Delete HA data volume and restart to re-bootstrap."
    exit 0
  fi
fi

# ---------- Step 3: Create user via onboarding ----------
log "Creating dev user '${USERNAME}'..."
ONBOARD_RESPONSE=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${NAME}\",\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\",\"client_id\":\"${CLIENT_ID}\",\"language\":\"en\"}" \
  "${HA_URL}/api/onboarding/users" 2>&1) || {
    log "ERROR: Onboarding user creation failed: ${ONBOARD_RESPONSE}"
    exit 2
  }

log "Onboarding response received"
AUTH_CODE=$(echo "$ONBOARD_RESPONSE" | sed -n 's/.*"auth_code":"\([^"]*\)".*/\1/p')

if [ -z "$AUTH_CODE" ]; then
  log "ERROR: Failed to extract auth_code from response: ${ONBOARD_RESPONSE}"
  exit 2
fi
log "Auth code obtained"

# ---------- Step 4: Exchange auth code for tokens ----------
log "Exchanging auth code for access tokens..."
TOKEN_RESPONSE=$(curl -sf -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=${AUTH_CODE}&client_id=${CLIENT_ID}" \
  "${HA_URL}/auth/token" 2>&1) || {
    log "ERROR: Token exchange failed: ${TOKEN_RESPONSE}"
    exit 3
  }

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$ACCESS_TOKEN" ]; then
  log "ERROR: Failed to extract access_token: ${TOKEN_RESPONSE}"
  exit 3
fi
log "Access token obtained"

# ---------- Step 5: Complete remaining onboarding steps ----------
log "Completing core_config onboarding step..."
curl -sf -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${HA_URL}/api/onboarding/core_config" > /dev/null 2>&1 || log "WARNING: core_config step already completed"

log "Completing analytics onboarding step..."
curl -sf -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  "${HA_URL}/api/onboarding/analytics" > /dev/null 2>&1 || log "WARNING: analytics step already completed"

log "Completing integration onboarding step..."
curl -sf -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${CLIENT_ID}\",\"redirect_uri\":\"${CLIENT_ID}\"}" \
  "${HA_URL}/api/onboarding/integration" > /dev/null 2>&1 || log "WARNING: integration step already completed"

# ---------- Step 6: Set up MQTT integration ----------
log "Setting up MQTT integration..."

MQTT_FLOW=$(curl -sf -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"handler":"mqtt","show_advanced_options":false}' \
  "${HA_URL}/api/config/config_entries/flow" 2>&1) || true

if [ -n "$MQTT_FLOW" ]; then
  FLOW_ID=$(echo "$MQTT_FLOW" | sed -n 's/.*"flow_id":"\([^"]*\)".*/\1/p')
  FLOW_TYPE=$(echo "$MQTT_FLOW" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')

  if [ "$FLOW_TYPE" = "abort" ]; then
    log "MQTT integration already configured"
  elif [ -n "$FLOW_ID" ]; then
    log "MQTT config flow started (${FLOW_ID}), submitting broker config..."
    MQTT_RESULT=$(curl -sf -X POST \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"broker":"mosquitto","port":1883}' \
      "${HA_URL}/api/config/config_entries/flow/${FLOW_ID}" 2>&1) || true

    MQTT_TYPE=$(echo "$MQTT_RESULT" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
    if [ "$MQTT_TYPE" = "create_entry" ]; then
      log "MQTT integration configured successfully"
    elif [ "$MQTT_TYPE" = "abort" ]; then
      log "MQTT integration already exists"
    else
      log "MQTT config result: ${MQTT_RESULT}"
    fi
  else
    log "MQTT flow response: ${MQTT_FLOW}"
  fi
else
  log "WARNING: Could not initiate MQTT config flow"
fi

# ---------- Step 7: Create long-lived access token via WebSocket ----------
log "Creating long-lived access token via WebSocket..."

# Export for Python to read
export _BOOTSTRAP_ACCESS_TOKEN="$ACCESS_TOKEN"

set +e  # Disable errexit for WS token creation (we handle errors explicitly)
LONG_LIVED_TOKEN=$(python3 -c "
import json, socket, struct, os, sys, base64

ha_url = os.environ['HA_URL']
access_token = os.environ['_BOOTSTRAP_ACCESS_TOKEN']

url_no_scheme = ha_url.replace('http://', '').replace('https://', '')
parts = url_no_scheme.rstrip('/').split(':')
host = parts[0]
port = int(parts[1]) if len(parts) > 1 else 80

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
    sock.connect((host, port))

    key = base64.b64encode(os.urandom(16)).decode()
    handshake = (
        f'GET /api/websocket HTTP/1.1\r\n'
        f'Host: {host}:{port}\r\n'
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
    assert auth_req['type'] == 'auth_required', f'Expected auth_required, got: {msg}'

    send_ws_frame(sock, json.dumps({
        'type': 'auth',
        'access_token': access_token
    }))

    msg = recv_ws_frame(sock)
    auth_result = json.loads(msg)
    assert auth_result['type'] == 'auth_ok', f'Auth failed: {msg}'

    send_ws_frame(sock, json.dumps({
        'id': 1,
        'type': 'auth/long_lived_access_token',
        'client_name': 'EP Dev Configurator',
        'lifespan': 365
    }))

    msg = recv_ws_frame(sock)
    result = json.loads(msg)
    assert result.get('success'), f'Token creation failed: {msg}'

    print(result['result'])
    sock.close()
except Exception as e:
    print(f'WSERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/tmp/ws_error.log)

WS_EXIT=$?
set -e  # Re-enable errexit
if [ "$WS_EXIT" -ne 0 ] || [ -z "$LONG_LIVED_TOKEN" ]; then
  WS_ERR=$(cat /tmp/ws_error.log 2>/dev/null || echo "unknown error")
  log "ERROR: Long-lived token creation via WebSocket failed: ${WS_ERR}"
  exit 4
fi

# ---------- Step 8: Write token to shared volume ----------
echo -n "$LONG_LIVED_TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
log "Token written to ${TOKEN_FILE}"

# Validate the token works
VALIDATE=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${LONG_LIVED_TOKEN}" \
  "${HA_URL}/api/" 2>/dev/null || echo "000")

if [ "$VALIDATE" = "200" ]; then
  log "Token validated successfully (HTTP 200)"
  log "Bootstrap complete. HA dev stack is ready."
  exit 0
else
  log "WARNING: Token validation returned HTTP ${VALIDATE}"
  log "Bootstrap finished — token written but validation pending."
  exit 0
fi
