# M003: M003: Multi-Device Room Support

## Vision
Allow multiple EP sensors in a single room — each with its own placement, radar cone, profile, and entity mappings — so users can cover large rooms or complex spaces with overlapping sensor coverage.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Backend sensors[] data model + migration | high | — | ✅ | Backend API returns rooms with `sensors[]` array. Existing rooms auto-migrate from `deviceId` → `sensors[0]`. `POST/PUT /api/rooms` accepts both old and new format. All backend tests pass. |
| S02 | Frontend data model + RoomCanvas multi-sensor rendering | medium | S01 | ✅ | Frontend types match backend `sensors[]`. RoomCanvas renders N colored radar cones. Room builder shows all sensors but device management UI is not yet wired — this proves rendering works. |
| S03 | Room builder device management UI | low | S02 | ✅ | Devices panel lists all sensors, "Add Device" links a new sensor, each sensor can be selected/dragged/removed. Full demo: add 2 devices to a room, place both, see overlapping radar coverage. |
