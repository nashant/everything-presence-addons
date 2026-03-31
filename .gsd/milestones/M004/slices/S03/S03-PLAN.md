# S03: Zone assignment + per-device translated zone writes

**Goal:** Wire S01's transform + assignment into the room save flow. When zones are saved, each covering sensor gets its zones written with correct device-relative coordinates.
**Demo:** After this: Room save triggers zone-to-sensor assignment, translates coordinates per sensor, and writes device-relative zones via zoneWriter. Correct coordinates verified in HA entity states.

## Tasks
