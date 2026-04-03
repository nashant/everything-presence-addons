/**
 * Jinja2 template generator for Home Assistant value_template fields.
 *
 * Pure functions: take entity ID strings, return Jinja2 template strings.
 * No runtime dependencies — fully unit-testable.
 *
 * Two flavours:
 * - MQTT value_template: outputs 'ON'/'OFF' strings (used in MQTT discovery payloads)
 * - Helper state template: outputs true/false booleans (used in HA template helpers)
 *
 * These templates aggregate occupancy/target-count data from multiple
 * EP sensor zone entities.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregation strategies for binary occupancy sensors. */
export type AggregationMode = 'or' | 'and' | 'majority';

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
// AND mode
// ---------------------------------------------------------------------------

/**
 * Jinja2 template: ON if ALL sensors report 'on', else OFF.
 * Uses `is_state()` calls joined with `and`.
 *
 * Single sensor:  {{ 'ON' if is_state('...', 'on') else 'OFF' }}
 * Multi sensor:   {{ 'ON' if is_state('...', 'on') and is_state('...', 'on') else 'OFF' }}
 * Empty list:     {{ 'OFF' }}
 */
export function generateAndTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return "{{ 'OFF' }}";
  }

  const conditions = sensorEntityIds
    .map((id) => `is_state('${id}', 'on')`)
    .join(' and ');

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
 * @param selfEntityId    - Required for 'majority' mode with even sensor
 *                          count (entity's own ID for tie-break self-reference).
 *                          Always pass it when available.
 */
export function generateTemplate(
  mode: AggregationMode,
  sensorEntityIds: string[],
  selfEntityId?: string,
): string {
  switch (mode) {
    case 'or':
      return generateOrTemplate(sensorEntityIds);

    case 'and':
      return generateAndTemplate(sensorEntityIds);

    case 'majority':
      // Even sensor count can tie — use tie-handling variant when selfEntityId available
      if (selfEntityId && sensorEntityIds.length > 1 && sensorEntityIds.length % 2 === 0) {
        return generateNoChangeOnTieTemplate(sensorEntityIds, selfEntityId);
      }
      return generateMajorityTemplate(sensorEntityIds);

    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown aggregation mode: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper-compatible templates (true/false output for HA template helpers)
// ---------------------------------------------------------------------------

/**
 * Jinja2 template for HA template helper: evaluates to true/false.
 *
 * OR mode: true if ANY sensor reports 'on'.
 * Single:  {{ is_state('...', 'on') }}
 * Multi:   {{ is_state('...', 'on') or is_state('...', 'on') }}
 * Empty:   {{ false }}
 */
export function generateHelperOrTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return '{{ false }}';
  }

  if (sensorEntityIds.length === 1) {
    return `{{ is_state('${sensorEntityIds[0]}', 'on') }}`;
  }

  const conditions = sensorEntityIds
    .map((id) => `  is_state('${id}', 'on')`)
    .join('\n  or ');

  return `{{\n${conditions}\n}}`;
}

/**
 * Jinja2 template for HA template helper: evaluates to true/false.
 *
 * Majority mode: true if MORE THAN HALF of sensors report 'on'.
 * Single:   {{ is_state('...', 'on') }}
 * Multi:    {% set ... %}{{ count_on > total / 2 }}
 * Empty:    {{ false }}
 */
export function generateHelperMajorityTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return '{{ false }}';
  }

  if (sensorEntityIds.length === 1) {
    return `{{ is_state('${sensorEntityIds[0]}', 'on') }}`;
  }

  const statesList = sensorEntityIds
    .map((id) => `  states('${id}')`)
    .join(',\n');

  const total = sensorEntityIds.length;

  return [
    `{% set sensors = [`,
    `${statesList}`,
    `] %}`,
    `{% set count_on = sensors | select('eq', 'on') | list | count %}`,
    `{{ count_on > ${total} / 2 }}`,
  ].join('\n');
}

/**
 * Jinja2 template for HA template helper: evaluates to true/false.
 *
 * AND mode: true if ALL sensors report 'on'.
 * Single:  {{ is_state('...', 'on') }}
 * Multi:   {{ is_state('...', 'on') and is_state('...', 'on') }}
 * Empty:   {{ false }}
 */
export function generateHelperAndTemplate(sensorEntityIds: string[]): string {
  if (sensorEntityIds.length === 0) {
    return '{{ false }}';
  }

  if (sensorEntityIds.length === 1) {
    return `{{ is_state('${sensorEntityIds[0]}', 'on') }}`;
  }

  const conditions = sensorEntityIds
    .map((id) => `  is_state('${id}', 'on')`)
    .join('\n  and ');

  return `{{\n${conditions}\n}}`;
}

/**
 * Jinja2 template for HA template helper: evaluates to true/false (or
 * holds previous state on tie).
 *
 * No-change-on-tie mode: true if majority on, false if majority off,
 * hold previous state on exact tie.
 *
 * Single:  {{ is_state('...', 'on') }}
 * Multi:   {% set ... %}{% if ... %}true{% elif ... %}false{% else %}{{ states('self') == 'on' }}{% endif %}
 * Empty:   {{ false }}
 */
export function generateHelperNoChangeOnTieTemplate(
  sensorEntityIds: string[],
  selfEntityId: string,
): string {
  if (sensorEntityIds.length === 0) {
    return '{{ false }}';
  }

  if (sensorEntityIds.length === 1) {
    return `{{ is_state('${sensorEntityIds[0]}', 'on') }}`;
  }

  const statesList = sensorEntityIds
    .map((id) => `  states('${id}')`)
    .join(',\n');

  const total = sensorEntityIds.length;

  return [
    `{% set sensors = [`,
    `${statesList}`,
    `] %}`,
    `{% set count_on = sensors | select('eq', 'on') | list | count %}`,
    `{% set total = ${total} %}`,
    `{% if count_on > total / 2 %}`,
    `  true`,
    `{% elif count_on < total / 2 %}`,
    `  false`,
    `{% else %}`,
    `  {{ is_state('${selfEntityId}', 'on') }}`,
    `{% endif %}`,
  ].join('\n');
}

/**
 * Route to the correct helper-compatible template generator.
 *
 * Produces templates that evaluate to true/false for use with
 * HA template helpers (not MQTT value_template which uses ON/OFF).
 *
 * @param mode            - Aggregation strategy
 * @param sensorEntityIds - Binary sensor entity IDs to aggregate
 * @param selfEntityId    - Required for 'no_change_on_tie' mode
 */
export function generateHelperTemplate(
  mode: AggregationMode,
  sensorEntityIds: string[],
  selfEntityId?: string,
): string {
  switch (mode) {
    case 'or':
      return generateHelperOrTemplate(sensorEntityIds);

    case 'and':
      return generateHelperAndTemplate(sensorEntityIds);

    case 'majority':
      if (selfEntityId && sensorEntityIds.length > 1 && sensorEntityIds.length % 2 === 0) {
        return generateHelperNoChangeOnTieTemplate(sensorEntityIds, selfEntityId);
      }
      return generateHelperMajorityTemplate(sensorEntityIds);

    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown aggregation mode: ${_exhaustive}`);
    }
  }
}
