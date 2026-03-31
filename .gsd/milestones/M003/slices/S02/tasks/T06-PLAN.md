---
estimated_steps: 13
estimated_files: 3
skills_used: []
---

# T06: Browser verification — multi-sensor rendering on correct codebase

Full end-to-end verification that multi-sensor rendering works on the correct room-first codebase with M003/S01 backend sensors support.

Steps:
1. Start backend + frontend dev servers (using dev docker compose or direct npm run dev)
2. Verify backend has sensors[] support: GET /api/rooms should return rooms with sensors[] array (from S01 migration)
3. Use API to create/update a room with 2 sensors (different profiles if available, else same profile at different positions)
4. Open Room Builder in browser, navigate to the multi-sensor room
5. Verify: two distinct-colored radar cones render (green + amber)
6. Verify: each sensor can be selected and dragged independently
7. Verify: after drag, reload page — positions persist via PUT /api/rooms with sensors[]
8. Navigate to a single-device room — verify it still renders normally via devicePlacement fallback
9. Run `npx tsc --noEmit` final time to confirm clean compile
10. Check browser console for errors/warnings
11. Verify room-first UI design is correct (walls, doors, furniture all present from M001/M002)

## Inputs

- `T01-T04 completed on correct branch`
- `Backend sensors[] from M003/S01`
- `Room-first UI from M001/M002`

## Expected Output

- `Verified multi-sensor rendering end-to-end on correct codebase`
- `No regressions in single-device rooms`
- `Clean TypeScript compilation`

## Verification

All browser checks pass: two colored cones render, drag works per-sensor, positions persist, single-device rooms unaffected, TypeScript clean, no console errors.
