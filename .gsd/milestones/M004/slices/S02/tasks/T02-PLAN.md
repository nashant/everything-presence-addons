---
estimated_steps: 42
estimated_files: 2
skills_used: []
---

# T02: Create Jinja2 template generator with unit tests for all aggregation modes

## Description

Create `backend/src/ha/templateGenerator.ts` — a pure-function module that generates Jinja2 template strings for HA value_template fields. This is the core logic of S02: translating zone-to-sensor assignments into correct Jinja2 that HA evaluates for occupancy aggregation.

The module needs no runtime dependencies — it takes entity ID strings and returns Jinja2 template strings. Fully unit-testable.

**Functions to implement:**

1. `generateOrTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that evaluates to `'ON'` if ANY sensor reports `'on'`, else `'OFF'`. Uses `is_state()` calls joined with `or`.
   - Example for 2 sensors: `{{ 'ON' if is_state('binary_sensor.mock_ep_lite_1_zone_2_occupancy', 'on') or is_state('binary_sensor.mock_ep_lite_2_zone_1_occupancy', 'on') else 'OFF' }}`

2. `generateMajorityTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that evaluates to `'ON'` if MORE THAN HALF of sensors report `'on'`, else `'OFF'`. Uses `states()` calls collected into a list, filtered with `select('eq', 'on')`, counted.

3. `generateNoChangeOnTieTemplate(sensorEntityIds: string[], selfEntityId: string): string` — Returns Jinja2 that evaluates to `'ON'` if majority on, `'OFF'` if majority off, and holds the entity's own previous state on tie. Uses `states()` for self-reference.

4. `generateMaxTargetCountTemplate(sensorEntityIds: string[]): string` — Returns Jinja2 that takes the max of `states()` calls with `|int(0)` fallback across all sensors. Output is the max integer.
   - Example: `{{ [states('sensor.mock_ep_lite_1_zone_2_target_count') | int(0), states('sensor.mock_ep_lite_2_zone_1_target_count') | int(0)] | max }}`

5. `generateTemplate(mode: AggregationMode, sensorEntityIds: string[], selfEntityId?: string): string` — Dispatcher that calls the correct generator based on mode. `AggregationMode` is a union type: `'or' | 'majority' | 'no_change_on_tie'`.

**Type to export:** `type AggregationMode = 'or' | 'majority' | 'no_change_on_tie';`

**Edge cases:**
- Single sensor: OR and majority both simplify to direct `is_state()` check
- Empty sensor list: return a template that evaluates to `'OFF'` (unavailable/no coverage)
- No-change-on-tie with single sensor: degenerates to direct check (tie impossible with 1)
- Max target count with single sensor: simplifies to `{{ states('sensor.x') | int(0) }}`

## Steps

1. Create `backend/src/ha/templateGenerator.ts` with all functions above
2. Export `AggregationMode` type
3. Create `backend/src/__tests__/unit/templateGenerator.test.ts` with comprehensive tests:
   - OR mode: 1 sensor, 2 sensors, 3 sensors — verify correct `is_state()` calls and `or` chaining
   - Majority mode: 1 sensor, 2 sensors, 3 sensors, 4 sensors — verify list construction and count comparison
   - No-change-on-tie: 2 sensors (tie possible), 3 sensors (no tie possible with odd count, but template should still handle it), verify self-reference entity ID appears correctly
   - Max target count: 1 sensor, 2 sensors, 3 sensors — verify `int(0)` fallbacks and `max` filter
   - Empty sensor list: all modes return sensible fallback
   - Dispatcher `generateTemplate()` routes to correct generator
4. Run tests: `npx vitest run src/__tests__/unit/templateGenerator.test.ts`

## Must-Haves

- [ ] All four aggregation mode generators produce syntactically valid Jinja2
- [ ] OR template uses `is_state()` with `or` chaining
- [ ] Majority template uses `states()` list with `select('eq', 'on')` count comparison
- [ ] No-change-on-tie template includes self-entity-id reference for tie fallback
- [ ] Max target count template uses `int(0)` fallback and `max` filter
- [ ] Edge cases (single sensor, empty list) handled
- [ ] AggregationMode type exported
- [ ] All unit tests pass

## Verification

- `cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/templateGenerator.test.ts` — all tests pass

## Negative Tests

- Empty sensor entity ID list for all aggregation modes
- Single sensor for all modes (degenerate cases)

## Inputs

- ``everything-presence-mmwave-configurator/config/device-profiles/everything_presence_lite.json` — zone entity template patterns (e.g., binary_sensor.${name}_zone_N_occupancy)`
- ``everything-presence-mmwave-configurator/backend/src/ha/discoveryPayload.ts` — discovery payload builder from T01 (for understanding entity ID conventions)`

## Expected Output

- ``everything-presence-mmwave-configurator/backend/src/ha/templateGenerator.ts` — Jinja2 template generator with AggregationMode type`
- ``everything-presence-mmwave-configurator/backend/src/__tests__/unit/templateGenerator.test.ts` — comprehensive unit tests for all aggregation modes`

## Verification

cd everything-presence-mmwave-configurator && npx vitest run src/__tests__/unit/templateGenerator.test.ts
