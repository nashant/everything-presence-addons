# Everything Presence — Room-First Configurator

A clean rewrite of the Everything Presence mmWave configurator with a room-first architecture. Instead of the current device-first wizard (pick device → discover entities → create room → place device), the flow becomes: create rooms first, then add sensors to them.

## Current State

- Branch: `feat/room-first-ux` from upstream main (2f097aa)
- Backend: upstream Express server with DI, transport abstraction, JSON persistence — boots and serves API
- Frontend: upstream React 18 + Vite + Tailwind — renders wizard UI
- Dev stack: Docker compose with HA 2026.2, Mosquitto, mock devices, auto-bootstrap
- Test infrastructure: vitest with MockReadTransport/MockWriteClient, 6 smoke tests

## Tech Stack

- **Backend**: Express + TypeScript (CommonJS, ES2021), pino logging, WebSocket for live tracking
- **Frontend**: React 18 + Vite + Tailwind CSS (ESM, ES2022), Biome for linting
- **Persistence**: JSON files (rooms.json, settings.json)
- **Integration**: Home Assistant REST + WebSocket APIs
- **Profiles**: JSON device profiles for EP Lite, EP One, EP Pro
- **Dev**: Docker compose with HA 2026.2, Mosquitto MQTT, MQTT mock devices
