# Knowledge Register

<!-- Append-only. Project-specific rules, patterns, and lessons learned.
     Read at the start of every unit. Append when you discover something future agents should know. -->

| # | When | Category | Insight |
|---|------|----------|---------|
| K001 | M003/S02 | frontend | `RoomCanvas.tsx` lives at `components/RoomCanvas.tsx`, NOT `components/canvas/RoomCanvas.tsx`. The `canvas/` subdirectory only contains the extracted item renderers and types. Check actual paths before writing file references in plans. |
| K002 | M003/S02 | frontend | When adding new rendering modes to RoomCanvas, remember that `showDevice` in RoomBuilderPage gates whether any device/sensor rendering happens. New conditions (like sensors[] presence) must be added to the showDevice prop expression, not just the rendering code. |
| K003 | M003/S02 | frontend | The api/rooms.ts import path is `./types` (same directory), not `../types`. This is because rooms.ts and types.ts are siblings in `src/api/`. Prior incorrect import compiled in some contexts but failed in strict tsc. |
| K004 | M003/S02 | frontend | Radar fill transparency: DeviceItemRenderer derives semi-transparent fill as `${color}22` (hex alpha append). This means color params MUST be 6-digit hex (e.g. `#22c55e`), not rgba or named colors. |
| K005 | M003/S02 | process | S02 branch had to be deleted and recreated because it was forked from `main` instead of `feat/multi-device-rooms`. Always verify merge-base before starting work on a slice branch. |
| K006 | M003 | process | Doctor recovery can mark a slice as "complete" without completing its tasks in the DB. This creates a deadlock: `gsd_task_complete` rejects tasks in closed slices, and `gsd_complete_milestone` rejects milestones with pending tasks. Fix by updating task status directly in the SQLite DB (`better-sqlite3` can be installed ad-hoc). |
| K007 | M003 | backend | Backend integration tests (rooms, floors, import, sensors-migration) all require the Docker container filesystem (`/config/`). They fail with EACCES outside Docker. The 52 frontend canvas tests and health/profiles endpoints work without Docker. |
