/**
 * Jinja2 template generator for Home Assistant value_template fields.
 *
 * Pure functions: take entity ID strings, return Jinja2 template strings.
 * No runtime dependencies — fully unit-testable.
 *
 * These templates are used in MQTT discovery payloads for virtual room
 * devices that aggregate occupancy/target-count data from multiple
 * EP sensor zone entities.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregation strategies for binary occupancy sensors. */
export type AggregationMode = 'or' | 'majority' | 'no_change_on_tie';

// ---------------------------------------------------------------------------
// OR mode
// ---------------------------------------------------------------------------

/**
 * Jinja2 template: ON if ANY sensor reports 'on', else OFF.
 * Uses `is_state()` calls joined with `or`.
 *
 * Single sensor:  {{ 'ON' if is_state('...', 'on') else 'OFF' }}
 * Multi sensor:   {{ 'ON' if is_state('...', 'on') or is_state('...', 'on') else 'OFF' }}
 * Empty list:     {{ 'OFF' }}
 */
export function generateOrTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return "{{ 'OFF' }}";
  }

  const conditions = sensorEntityIds
    .map((id) => `is_state('${id}', 'on')`)
    .join(' or ');

  return `{{ 'ON' if ${conditions} else 'OFF' }}`;
}

// ---------------------------------------------------------------------------
// Majority mode
// ---------------------------------------------------------------------------

/**
 * Jinja2 template: ON if MORE THAN HALF of sensors report 'on', else OFF.
 *
 * Builds a list of state strings, filters for 'on', counts, and compares
 * against total / 2.
 *
 * Single sensor: degenerates to direct is_state check (majority of 1 = that 1).
 * Empty list:    {{ 'OFF' }}
 */
export function generateMajorityTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return "{{ 'OFF' }}";
  }

  // Single sensor — majority of 1 is just "is it on?"
  if (sensorEntityIds.length === 1) {
    return `{{ 'ON' if is_state('${sensorEntityIds[0]}', 'on') else 'OFF' }}`;
  }

  const statesList = sensorEntityIds
    .map((id) => `states('${id}')`)
    .join(', ');

  // count_on > total / 2  means strictly more than half
  const total = sensorEntityIds.length;

  return (
    `{% set sensors = [${statesList}] %}` +
    `{% set count_on = sensors | select('eq', 'on') | list | count %}` +
    `{{ 'ON' if count_on > ${total} / 2 else 'OFF' }}`
  );
}

// ---------------------------------------------------------------------------
// No-change-on-tie mode
// ---------------------------------------------------------------------------

/**
 * Jinja2 template: ON if majority on, OFF if majority off, hold previous
 * state on exact tie.
 *
 * Uses `states(self_entity_id)` to read the entity's own current state
 * as the tie-breaker fallback.
 *
 * Single sensor: tie impossible — degenerates to direct check.
 * Empty list:    {{ 'OFF' }}
 */
export function generateNoChangeOnTieTemplate(
  sensorEntityIds: string[],
  selfEntityId: string,
): string {
  if (sensorEntityIds.length === 0) {
    return "{{ 'OFF' }}";
  }

  // Single sensor — tie impossible
  if (sensorEntityIds.length === 1) {
    return `{{ 'ON' if is_state('${sensorEntityIds[0]}', 'on') else 'OFF' }}`;
  }

  const statesList = sensorEntityIds
    .map((id) => `states('${id}')`)
    .join(', ');

  const total = sensorEntityIds.length;

  return (
    `{% set sensors = [${statesList}] %}` +
    `{% set count_on = sensors | select('eq', 'on') | list | count %}` +
    `{% set total = ${total} %}` +
    `{% if count_on > total / 2 %}ON` +
    `{% elif count_on < total / 2 %}OFF` +
    `{% else %}{{ states('${selfEntityId}') | default('OFF', true) }}` +
    `{% endif %}`
  );
}

// ---------------------------------------------------------------------------
// Max target count mode
// ---------------------------------------------------------------------------

/**
 * Jinja2 template: max integer across all sensor target-count values.
 * Uses `| int(0)` fallback so unavailable/unknown sensors default to 0.
 *
 * Single sensor: {{ states('sensor.x') | int(0) }}
 * Multi sensor:  {{ [states('sensor.x') | int(0), states('sensor.y') | int(0)] | max }}
 * Empty list:    {{ 0 }}
 */
export function generateMaxTargetCountTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return '{{ 0 }}';
  }

  if (sensorEntityIds.length === 1) {
    return `{{ states('${sensorEntityIds[0]}') | int(0) }}`;
  }

  const entries = sensorEntityIds
    .map((id) => `states('${id}') | int(0)`)
    .join(', ');

  return `{{ [${entries}] | max }}`;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Route to the correct template generator based on aggregation mode.
 *
 * Note: `generateMaxTargetCountTemplate` is intentionally NOT in the
 * dispatcher — it uses a different entity type (sensor vs binary_sensor)
 * and is called directly by the orchestration layer.
 *
 * @param mode            - Aggregation strategy
 * @param sensorEntityIds - Binary sensor entity IDs to aggregate
 * @param selfEntityId    - Required for 'no_change_on_tie' mode (the
 *                          entity's own ID for tie-break self-reference)
 */
export function generateTemplate(
  mode: AggregationMode,
  sensorEntityIds: string[],
  selfEntityId?: string,
): string {
  switch (mode) {
    case 'or':
      return generateOrTemplate(sensorEntityIds);

    case 'majority':
      return generateMajorityTemplate(sensorEntityIds);

    case 'no_change_on_tie':
      if (!selfEntityId) {
        throw new Error(
          "generateTemplate: 'no_change_on_tie' mode requires selfEntityId",
        );
      }
      return generateNoChangeOnTieTemplate(sensorEntityIds, selfEntityId);

    default: {
      // Exhaustive check — TypeScript narrows to `never` here
      const _exhaustive: never = mode;
      throw new Error(`Unknown aggregation mode: ${_exhaustive}`);
    }
  }
}
