# S04: Room device lifecycle + aggregation config

**Goal:** Wire S02's HA integration + S03's zone assignments into the complete room device lifecycle. Generate Jinja2 templates from zone assignment metadata with configurable aggregation.
**Demo:** After this: Full pipeline: zone save creates/updates HA room device with template binary sensors. Aggregation strategy configurable per zone (OR/majority/no-change-on-tie). Room delete cleans up HA entities. Target count uses max.

## Tasks
