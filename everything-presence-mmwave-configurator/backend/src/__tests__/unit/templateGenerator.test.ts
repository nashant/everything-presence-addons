import { describe, it, expect } from 'vitest';
import {
  generateOrTemplate,
  generateMajorityTemplate,
  generateNoChangeOnTieTemplate,
  generateMaxTargetCountTemplate,
  generateTemplate,
  type AggregationMode,
} from '../../ha/templateGenerator';

// ---------------------------------------------------------------------------
// Helper — entity IDs used across tests
// ---------------------------------------------------------------------------
const SENSOR_1 = 'binary_sensor.mock_ep_lite_1_zone_1_occupancy';
const SENSOR_2 = 'binary_sensor.mock_ep_lite_2_zone_1_occupancy';
const SENSOR_3 = 'binary_sensor.mock_ep_lite_3_zone_2_occupancy';
const SENSOR_4 = 'binary_sensor.mock_ep_lite_4_zone_1_occupancy';

const TARGET_1 = 'sensor.mock_ep_lite_1_zone_1_target_count';
const TARGET_2 = 'sensor.mock_ep_lite_2_zone_1_target_count';
const TARGET_3 = 'sensor.mock_ep_lite_3_zone_2_target_count';

const SELF_ENTITY = 'binary_sensor.ep_room_living_room_zone_0_occupancy';

// ---------------------------------------------------------------------------
// OR mode
// ---------------------------------------------------------------------------
describe('generateOrTemplate', () => {
  it('returns OFF template for empty sensor list', () => {
    expect(generateOrTemplate([])).toBe("{{ 'OFF' }}");
  });

  it('generates single is_state check for 1 sensor', () => {
    const result = generateOrTemplate([SENSOR_1]);
    expect(result).toBe(
      `{{ 'ON' if is_state('${SENSOR_1}', 'on') else 'OFF' }}`,
    );
    // No 'or' keyword with a single sensor
    expect(result).not.toContain(' or ');
  });

  it('chains 2 sensors with or', () => {
    const result = generateOrTemplate([SENSOR_1, SENSOR_2]);
    expect(result).toContain(`is_state('${SENSOR_1}', 'on')`);
    expect(result).toContain(`is_state('${SENSOR_2}', 'on')`);
    expect(result).toContain(' or ');
    expect(result).toContain("'ON' if");
    expect(result).toContain("else 'OFF'");
  });

  it('chains 3 sensors with or', () => {
    const result = generateOrTemplate([SENSOR_1, SENSOR_2, SENSOR_3]);
    // Should have exactly 2 'or' joins for 3 sensors
    const orCount = (result.match(/ or /g) || []).length;
    expect(orCount).toBe(2);
    expect(result).toContain(`is_state('${SENSOR_3}', 'on')`);
  });

  it('produces valid Jinja2 delimiters', () => {
    const result = generateOrTemplate([SENSOR_1]);
    expect(result).toMatch(/^\{\{.*\}\}$/);
  });
});

// ---------------------------------------------------------------------------
// Majority mode
// ---------------------------------------------------------------------------
describe('generateMajorityTemplate', () => {
  it('returns OFF template for empty sensor list', () => {
    expect(generateMajorityTemplate([])).toBe("{{ 'OFF' }}");
  });

  it('degenerates to is_state for 1 sensor', () => {
    const result = generateMajorityTemplate([SENSOR_1]);
    expect(result).toBe(
      `{{ 'ON' if is_state('${SENSOR_1}', 'on') else 'OFF' }}`,
    );
    // No list/count logic needed
    expect(result).not.toContain('select');
    expect(result).not.toContain('count');
  });

  it('builds states list and count comparison for 2 sensors', () => {
    const result = generateMajorityTemplate([SENSOR_1, SENSOR_2]);
    expect(result).toContain(`states('${SENSOR_1}')`);
    expect(result).toContain(`states('${SENSOR_2}')`);
    expect(result).toContain("select('eq', 'on')");
    expect(result).toContain('| list | count');
    expect(result).toContain('count_on > 2 / 2');
  });

  it('builds correct threshold for 3 sensors', () => {
    const result = generateMajorityTemplate([SENSOR_1, SENSOR_2, SENSOR_3]);
    expect(result).toContain('count_on > 3 / 2');
    // 3 states() calls in the list
    const statesCount = (result.match(/states\('/g) || []).length;
    expect(statesCount).toBe(3);
  });

  it('builds correct threshold for 4 sensors', () => {
    const result = generateMajorityTemplate([
      SENSOR_1,
      SENSOR_2,
      SENSOR_3,
      SENSOR_4,
    ]);
    expect(result).toContain('count_on > 4 / 2');
    const statesCount = (result.match(/states\('/g) || []).length;
    expect(statesCount).toBe(4);
  });

  it('uses Jinja2 set and block tags', () => {
    const result = generateMajorityTemplate([SENSOR_1, SENSOR_2]);
    expect(result).toContain('{% set sensors =');
    expect(result).toContain('{% set count_on =');
  });
});

// ---------------------------------------------------------------------------
// No-change-on-tie mode
// ---------------------------------------------------------------------------
describe('generateNoChangeOnTieTemplate', () => {
  it('returns OFF template for empty sensor list', () => {
    expect(generateNoChangeOnTieTemplate([], SELF_ENTITY)).toBe("{{ 'OFF' }}");
  });

  it('degenerates to is_state for 1 sensor (tie impossible)', () => {
    const result = generateNoChangeOnTieTemplate([SENSOR_1], SELF_ENTITY);
    expect(result).toBe(
      `{{ 'ON' if is_state('${SENSOR_1}', 'on') else 'OFF' }}`,
    );
    // No self-reference needed — tie impossible with 1 sensor
    expect(result).not.toContain(SELF_ENTITY);
  });

  it('includes self-entity reference for 2 sensors (tie possible)', () => {
    const result = generateNoChangeOnTieTemplate(
      [SENSOR_1, SENSOR_2],
      SELF_ENTITY,
    );
    expect(result).toContain(`states('${SELF_ENTITY}')`);
    expect(result).toContain("| default('OFF', true)");
  });

  it('uses if/elif/else for majority/minority/tie with 2 sensors', () => {
    const result = generateNoChangeOnTieTemplate(
      [SENSOR_1, SENSOR_2],
      SELF_ENTITY,
    );
    expect(result).toContain('{% if count_on > total / 2 %}ON');
    expect(result).toContain('{% elif count_on < total / 2 %}OFF');
    expect(result).toContain('{% else %}');
    expect(result).toContain('{% endif %}');
  });

  it('handles 3 sensors (odd count — tie still possible in Jinja float division)', () => {
    const result = generateNoChangeOnTieTemplate(
      [SENSOR_1, SENSOR_2, SENSOR_3],
      SELF_ENTITY,
    );
    expect(result).toContain('{% set total = 3 %}');
    expect(result).toContain(`states('${SELF_ENTITY}')`);
    // All 3 sensors referenced
    const statesCount = (result.match(/states\('/g) || []).length;
    // 3 sensor states + 1 self-entity states
    expect(statesCount).toBe(4);
  });

  it('sets total variable correctly', () => {
    const result = generateNoChangeOnTieTemplate(
      [SENSOR_1, SENSOR_2],
      SELF_ENTITY,
    );
    expect(result).toContain('{% set total = 2 %}');
  });
});

// ---------------------------------------------------------------------------
// Max target count mode
// ---------------------------------------------------------------------------
describe('generateMaxTargetCountTemplate', () => {
  it('returns 0 template for empty sensor list', () => {
    expect(generateMaxTargetCountTemplate([])).toBe('{{ 0 }}');
  });

  it('generates direct states() with int(0) for 1 sensor', () => {
    const result = generateMaxTargetCountTemplate([TARGET_1]);
    expect(result).toBe(`{{ states('${TARGET_1}') | int(0) }}`);
    // No list or max needed
    expect(result).not.toContain('max');
    expect(result).not.toContain('[');
  });

  it('generates list with max filter for 2 sensors', () => {
    const result = generateMaxTargetCountTemplate([TARGET_1, TARGET_2]);
    expect(result).toContain(`states('${TARGET_1}') | int(0)`);
    expect(result).toContain(`states('${TARGET_2}') | int(0)`);
    expect(result).toContain('| max');
    expect(result).toMatch(/^\{\{ \[.*\] \| max \}\}$/);
  });

  it('generates list with max filter for 3 sensors', () => {
    const result = generateMaxTargetCountTemplate([
      TARGET_1,
      TARGET_2,
      TARGET_3,
    ]);
    const intCount = (result.match(/\| int\(0\)/g) || []).length;
    expect(intCount).toBe(3);
    expect(result).toContain('| max');
  });
});

// ---------------------------------------------------------------------------
// Dispatcher: generateTemplate
// ---------------------------------------------------------------------------
describe('generateTemplate', () => {
  it('routes "or" to generateOrTemplate', () => {
    const direct = generateOrTemplate([SENSOR_1, SENSOR_2]);
    const dispatched = generateTemplate('or', [SENSOR_1, SENSOR_2]);
    expect(dispatched).toBe(direct);
  });

  it('routes "majority" to generateMajorityTemplate', () => {
    const direct = generateMajorityTemplate([SENSOR_1, SENSOR_2]);
    const dispatched = generateTemplate('majority', [SENSOR_1, SENSOR_2]);
    expect(dispatched).toBe(direct);
  });

  it('routes "no_change_on_tie" to generateNoChangeOnTieTemplate', () => {
    const direct = generateNoChangeOnTieTemplate(
      [SENSOR_1, SENSOR_2],
      SELF_ENTITY,
    );
    const dispatched = generateTemplate(
      'no_change_on_tie',
      [SENSOR_1, SENSOR_2],
      SELF_ENTITY,
    );
    expect(dispatched).toBe(direct);
  });

  it('throws if no_change_on_tie called without selfEntityId', () => {
    expect(() =>
      generateTemplate('no_change_on_tie', [SENSOR_1, SENSOR_2]),
    ).toThrow("'no_change_on_tie' mode requires selfEntityId");
  });

  it('handles empty sensor list for all modes', () => {
    expect(generateTemplate('or', [])).toBe("{{ 'OFF' }}");
    expect(generateTemplate('majority', [])).toBe("{{ 'OFF' }}");
    expect(generateTemplate('no_change_on_tie', [], 'self.entity')).toBe(
      "{{ 'OFF' }}",
    );
  });
});

// ---------------------------------------------------------------------------
// Type export verification (compile-time, but exercised at test time)
// ---------------------------------------------------------------------------
describe('AggregationMode type', () => {
  it('accepts valid mode values', () => {
    const modes: AggregationMode[] = ['or', 'majority', 'no_change_on_tie'];
    modes.forEach((mode) => {
      // Should not throw — just verifying type compatibility at runtime
      expect(generateTemplate(mode, [SENSOR_1], SELF_ENTITY)).toBeTruthy();
    });
  });
});
