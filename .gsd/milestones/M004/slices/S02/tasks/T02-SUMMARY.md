---
id: T02
parent: S02
milestone: M004
provides: []
requires: []
affects: []
key_files: ["everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts", "everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts"]
key_decisions: ["Majority uses Jinja2 float division (count_on > N / 2) so odd counts resolve correctly without integer rounding", "No-change-on-tie uses states() with default('OFF', true) for self-reference fallback when entity is unavailable/unknown", "generateMaxTargetCountTemplate excluded from AggregationMode dispatcher — uses sensor entities, called directly by orchestration", "Single-sensor degenerate cases simplify to direct is_state/states calls instead of list construction"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "npx vitest run backend/src/__tests__/unit/templateGenerator.test.ts — 27/27 tests pass. npx vitest run backend/src/__tests__/unit/discoveryPayload.test.ts — 32/32 T01 tests still pass. grep confirms mqtt dependency in package.json."
completed_at: 2026-03-31T10:53:07.099Z
blocker_discovered: false
---

# T02: Created templateGenerator.ts with four Jinja2 generators (OR, majority, no-change-on-tie, max target count), dispatcher, AggregationMode type, and 27 passing unit tests

> Created templateGenerator.ts with four Jinja2 generators (OR, majority, no-change-on-tie, max target count), dispatcher, AggregationMode type, and 27 passing unit tests

## What Happened
---
id: T02
parent: S02
milestone: M004
key_files:
  - everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts
  - everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts
key_decisions:
  - Majority uses Jinja2 float division (count_on > N / 2) so odd counts resolve correctly without integer rounding
  - No-change-on-tie uses states() with default('OFF', true) for self-reference fallback when entity is unavailable/unknown
  - generateMaxTargetCountTemplate excluded from AggregationMode dispatcher — uses sensor entities, called directly by orchestration
  - Single-sensor degenerate cases simplify to direct is_state/states calls instead of list construction
duration: ""
verification_result: passed
completed_at: 2026-03-31T10:53:07.099Z
blocker_discovered: false
---

# T02: Created templateGenerator.ts with four Jinja2 generators (OR, majority, no-change-on-tie, max target count), dispatcher, AggregationMode type, and 27 passing unit tests

**Created templateGenerator.ts with four Jinja2 generators (OR, majority, no-change-on-tie, max target count), dispatcher, AggregationMode type, and 27 passing unit tests**

## What Happened

Implemented backend/src/ha/templateGenerator.ts as a pure-function module with no runtime dependencies. Four template generators cover all aggregation strategies: OR mode chains is_state() calls with 'or', majority mode builds a states() list filtered with select('eq','on') and compares against total/2, no-change-on-tie uses if/elif/else with self-entity states() fallback on tie, and max target count builds a list of states()|int(0) piped through |max. The generateTemplate dispatcher routes AggregationMode unions with exhaustive TypeScript checking. Edge cases (empty lists, single sensor) produce simplified templates. 27 unit tests cover all modes with varying sensor counts, empty lists, degenerate cases, dispatcher routing, and the negative case of missing selfEntityId.

## Verification

npx vitest run backend/src/__tests__/unit/templateGenerator.test.ts — 27/27 tests pass. npx vitest run backend/src/__tests__/unit/discoveryPayload.test.ts — 32/32 T01 tests still pass. grep confirms mqtt dependency in package.json.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/templateGenerator.test.ts` | 0 | ✅ pass | 2900ms |
| 2 | `cd everything-presence-mmwave-configurator && npx vitest run backend/src/__tests__/unit/discoveryPayload.test.ts` | 0 | ✅ pass | 2600ms |
| 3 | `grep '"mqtt"' everything-presence-mmwave-configurator/package.json` | 0 | ✅ pass | 50ms |


## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts`
- `everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts`


## Deviations
None.

## Known Issues
None.
