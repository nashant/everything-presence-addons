# M004: 

## Vision
Allow room-level zone drawing to automatically fan out translated coordinates to each covering sensor, create a virtual HA room device with template binary sensors per zone, and configure aggregation strategies — so HA handles occupancy at runtime without the configurator running.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Coordinate transform + zone coverage engine | high | — | ⬜ | Unit tests prove room-space → device-space transform is correct for all orientations. Coverage analysis returns per-sensor overlap percentages for each zone. Zone assignment maps zones to device slots respecting profile limits. |
| S02 | HA room device + template sensor creation proof | high | — | ⬜ | A hardcoded test room creates a virtual HA device via MQTT discovery. Template binary sensors created via WS API appear in HA device registry with correct Jinja2 templates referencing EP sensor zone entities. |
| S03 | Zone assignment + per-device translated zone writes | medium | S01 | ⬜ | Room save triggers zone-to-sensor assignment, translates coordinates per sensor, and writes device-relative zones via zoneWriter. Correct coordinates verified in HA entity states. |
| S04 | Room device lifecycle + aggregation config | medium | S02, S03 | ⬜ | Full pipeline: zone save creates/updates HA room device with template binary sensors. Aggregation strategy configurable per zone (OR/majority/no-change-on-tie). Room delete cleans up HA entities. Target count uses max. |
| S05 | Frontend zone coverage visualization + config UI | low | S01, S04 | ⬜ | Room builder shows per-sensor zone coverage indicators with overlap percentages. Users can set aggregation strategy and overlap threshold per zone. Uncovered zones display warnings. |
