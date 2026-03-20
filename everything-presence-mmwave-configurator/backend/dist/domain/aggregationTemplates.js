"use strict";
/**
 * Pure functions that generate Jinja2 template strings for HA template helpers.
 * These templates are evaluated by HA at runtime to produce aggregated states
 * from multiple sensor entities.
 *
 * Zone presence and zone target count use the same builders — callers pass
 * zone-specific entity IDs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPresenceTemplate = buildPresenceTemplate;
exports.buildTargetCountTemplate = buildTargetCountTemplate;
exports.buildEnvironmentalTemplate = buildEnvironmentalTemplate;
// ── Presence (binary_sensor: occupancy / zone occupancy) ─────────
/**
 * Build a Jinja2 template for aggregated presence (binary_sensor).
 *
 * - `any` mode: ON if any sensor is ON (OR logic)
 * - `all` mode: ON if all sensors are ON (AND logic)
 * - `majority` mode: ON if more than half are ON, with tie-breaker for even counts
 *
 * All templates guard with `has_value()` to filter unavailable/unknown entities.
 *
 * @param entityIds  - binary_sensor entity IDs to aggregate
 * @param mode       - aggregation mode
 * @param tieBreaker - only used for majority mode with even sensor counts
 * @returns Jinja2 template string producing 'on' or 'off'
 */
function buildPresenceTemplate(entityIds, mode, tieBreaker) {
    if (entityIds.length === 0)
        return "off";
    if (entityIds.length === 1) {
        return buildSinglePresenceTemplate(entityIds[0]);
    }
    switch (mode) {
        case "any":
            return buildAnyPresenceTemplate(entityIds);
        case "all":
            return buildAllPresenceTemplate(entityIds);
        case "majority":
            return buildMajorityPresenceTemplate(entityIds, tieBreaker ?? "occupied");
    }
}
function buildSinglePresenceTemplate(entityId) {
    return `{% if has_value('${entityId}') and is_state('${entityId}', 'on') %}on{% else %}off{% endif %}`;
}
function buildAnyPresenceTemplate(entityIds) {
    // Filter to available entities, then OR them
    const conditions = entityIds
        .map((e) => `(has_value('${e}') and is_state('${e}', 'on'))`)
        .join("\n        or ");
    return `{% if ${conditions} %}on{% else %}off{% endif %}`;
}
function buildAllPresenceTemplate(entityIds) {
    // All available entities must be ON
    const conditions = entityIds
        .map((e) => `(has_value('${e}') and is_state('${e}', 'on'))`)
        .join("\n        and ");
    return `{% if ${conditions} %}on{% else %}off{% endif %}`;
}
function buildMajorityPresenceTemplate(entityIds, tieBreaker) {
    const n = entityIds.length;
    // Build set assignments to count occupied sensors
    const setLines = entityIds.map((e, i) => `{% set ns.count = ns.count + (1 if has_value('${e}') and is_state('${e}', 'on') else 0) %}`);
    const isEven = n % 2 === 0;
    // For odd counts, simple majority: count > n/2 (e.g., 3 sensors → > 1.5 → need 2+)
    // For even counts, tie-breaker determines the threshold at exactly n/2
    let condition;
    if (!isEven) {
        // Odd: strict majority, no tie possible
        condition = `ns.count > ${n} / 2`;
    }
    else {
        // Even: tie is possible at exactly n/2
        switch (tieBreaker) {
            case "occupied":
                // Tie goes to occupied: >= n/2
                condition = `ns.count >= ${n} / 2`;
                break;
            case "not_occupied":
                // Tie goes to not_occupied: > n/2 (strict)
                condition = `ns.count > ${n} / 2`;
                break;
            case "no_change":
                // Tie preserves previous state via this.state
                condition = `ns.count > ${n} / 2 or (ns.count == ${n} / 2 and this.state == 'on')`;
                break;
        }
    }
    return [
        "{% set ns = namespace(count=0) %}",
        ...setLines,
        `{% if ${condition} %}on{% else %}off{% endif %}`,
    ].join("\n");
}
// ── Target Count (sensor: sum) ───────────────────────────────────
/**
 * Build a Jinja2 template for aggregated target count (sensor).
 * Sums all sensors' target count values with `| float(0)` safe casting.
 *
 * @param entityIds - sensor entity IDs to sum
 * @returns Jinja2 template string producing an integer
 */
function buildTargetCountTemplate(entityIds) {
    if (entityIds.length === 0)
        return "0";
    if (entityIds.length === 1) {
        return `{{ states('${entityIds[0]}') | float(0) | int }}`;
    }
    // Build a sum with has_value guard: only include entities that have a value
    const sumParts = entityIds.map((e) => `(states('${e}') | float(0) if has_value('${e}') else 0)`);
    const sumExpr = sumParts.join(" + ");
    return `{{ (${sumExpr}) | int }}`;
}
// ── Environmental (sensor: avg/min/max) ──────────────────────────
/**
 * Build a Jinja2 template for aggregated environmental sensor (sensor).
 * Supports average, min, and max aggregation methods.
 * Filters with `has_value()` to exclude unavailable entities.
 *
 * @param entityIds - sensor entity IDs to aggregate
 * @param method    - aggregation method
 * @returns Jinja2 template string producing a float
 */
function buildEnvironmentalTemplate(entityIds, method) {
    if (entityIds.length === 0)
        return "0";
    if (entityIds.length === 1) {
        return `{{ states('${entityIds[0]}') | float(0) }}`;
    }
    // Build a list of valid values filtered by has_value
    const valuesList = entityIds
        .map((e) => `states('${e}') | float(0)`)
        .join(", ");
    const hasValueFilters = entityIds
        .map((e) => `has_value('${e}')`)
        .join(", ");
    // Use Jinja2 namespace to build filtered values list
    const addLines = entityIds.map((e) => `{% if has_value('${e}') %}{% set ns.vals = ns.vals + [states('${e}') | float(0)] %}{% endif %}`);
    let aggregation;
    switch (method) {
        case "average":
            aggregation = "(ns.vals | sum) / (ns.vals | length)";
            break;
        case "min":
            aggregation = "ns.vals | min";
            break;
        case "max":
            aggregation = "ns.vals | max";
            break;
    }
    return [
        "{% set ns = namespace(vals=[]) %}",
        ...addLines,
        `{% if ns.vals | length > 0 %}{{ ${aggregation} | round(1) }}{% else %}0{% endif %}`,
    ].join("\n");
}
