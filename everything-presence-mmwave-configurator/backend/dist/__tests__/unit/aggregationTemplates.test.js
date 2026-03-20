"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const aggregationTemplates_1 = require("../../domain/aggregationTemplates");
// ── Room Occupancy (presence) ────────────────────────────────────
(0, vitest_1.describe)("buildPresenceTemplate", () => {
    (0, vitest_1.describe)("any mode (OR logic)", () => {
        (0, vitest_1.it)("produces OR template for 2 sensors", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.sensor1_presence", "binary_sensor.sensor2_presence"], "any");
            // Should use OR: if any sensor is on → on
            (0, vitest_1.expect)(result).toContain("is_state");
            (0, vitest_1.expect)(result).toContain("binary_sensor.sensor1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.sensor2_presence");
            (0, vitest_1.expect)(result).toContain("has_value");
            // "any" mode: result is 'on' if ANY sensor is on
            (0, vitest_1.expect)(result).toContain("or");
        });
        (0, vitest_1.it)("produces OR template for 3 sensors", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)([
                "binary_sensor.s1_presence",
                "binary_sensor.s2_presence",
                "binary_sensor.s3_presence",
            ], "any");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s2_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s3_presence");
        });
    });
    (0, vitest_1.describe)("all mode (AND logic)", () => {
        (0, vitest_1.it)("produces AND template for 2 sensors", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.sensor1_presence", "binary_sensor.sensor2_presence"], "all");
            (0, vitest_1.expect)(result).toContain("is_state");
            (0, vitest_1.expect)(result).toContain("binary_sensor.sensor1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.sensor2_presence");
            (0, vitest_1.expect)(result).toContain("has_value");
            // "all" mode: result is 'on' only if ALL sensors are on
            (0, vitest_1.expect)(result).toContain("and");
        });
    });
    (0, vitest_1.describe)("majority mode", () => {
        (0, vitest_1.it)("produces majority template with odd sensor count (3 sensors → threshold >1)", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)([
                "binary_sensor.s1_presence",
                "binary_sensor.s2_presence",
                "binary_sensor.s3_presence",
            ], "majority");
            // Count occupied sensors, compare to > N/2
            (0, vitest_1.expect)(result).toContain("is_state");
            (0, vitest_1.expect)(result).toContain("has_value");
            // For 3 sensors, threshold is > 1.5 which means >= 2
            // The template counts how many are 'on' and compares
            (0, vitest_1.expect)(result).toContain("binary_sensor.s1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s2_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s3_presence");
        });
        (0, vitest_1.it)("produces majority template with even count + occupied tie-breaker", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.s1_presence", "binary_sensor.s2_presence"], "majority", "occupied");
            // For 2 sensors: tie at 1 occupied → tie-breaker decides
            // "occupied" tie-breaker: >= N/2 → on (i.e., threshold is >=1)
            (0, vitest_1.expect)(result).toContain("binary_sensor.s1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s2_presence");
            (0, vitest_1.expect)(result).toContain("has_value");
        });
        (0, vitest_1.it)("produces majority template with even count + not_occupied tie-breaker", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.s1_presence", "binary_sensor.s2_presence"], "majority", "not_occupied");
            // "not_occupied" tie-breaker: > N/2 required (strict majority)
            (0, vitest_1.expect)(result).toContain("binary_sensor.s1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s2_presence");
        });
        (0, vitest_1.it)("produces majority template with even count + no_change tie-breaker", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.s1_presence", "binary_sensor.s2_presence"], "majority", "no_change");
            // "no_change" tie-breaker: uses this.state to preserve previous state
            (0, vitest_1.expect)(result).toContain("this.state");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s1_presence");
            (0, vitest_1.expect)(result).toContain("binary_sensor.s2_presence");
        });
        (0, vitest_1.it)("tie-breaker differences: occupied vs not_occupied produce different templates", () => {
            const entities = [
                "binary_sensor.s1_presence",
                "binary_sensor.s2_presence",
            ];
            const occupied = (0, aggregationTemplates_1.buildPresenceTemplate)(entities, "majority", "occupied");
            const notOccupied = (0, aggregationTemplates_1.buildPresenceTemplate)(entities, "majority", "not_occupied");
            (0, vitest_1.expect)(occupied).not.toEqual(notOccupied);
        });
    });
    (0, vitest_1.describe)("degenerate cases", () => {
        (0, vitest_1.it)("single sensor produces simple pass-through template", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.only_sensor_presence"], "any");
            // Single sensor: no aggregation wrapping needed
            (0, vitest_1.expect)(result).toContain("binary_sensor.only_sensor_presence");
            (0, vitest_1.expect)(result).toContain("is_state");
            // Should be simpler than multi-sensor — no OR/AND/counting logic
            // (the single-entity template uses `has_value(...) and is_state(...)` as
            // a guard clause, not as multi-sensor aggregation)
            (0, vitest_1.expect)(result).not.toContain(" or ");
            (0, vitest_1.expect)(result).not.toContain("namespace");
        });
        (0, vitest_1.it)("empty entity list returns constant 'off'", () => {
            const result = (0, aggregationTemplates_1.buildPresenceTemplate)([], "any");
            (0, vitest_1.expect)(result).toBe("off");
        });
    });
});
// ── Per-zone occupancy ───────────────────────────────────────────
(0, vitest_1.describe)("buildPresenceTemplate for zone use", () => {
    (0, vitest_1.it)("works with zone-specific entity IDs (any mode)", () => {
        const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.s1_zone1_occupancy", "binary_sensor.s2_zone1_occupancy"], "any");
        (0, vitest_1.expect)(result).toContain("binary_sensor.s1_zone1_occupancy");
        (0, vitest_1.expect)(result).toContain("binary_sensor.s2_zone1_occupancy");
        (0, vitest_1.expect)(result).toContain("has_value");
    });
    (0, vitest_1.it)("zone with override mode uses provided mode", () => {
        // Zone overrides are resolved by the caller — the builder just
        // receives the effective mode. Test that 'all' works with zone entities.
        const result = (0, aggregationTemplates_1.buildPresenceTemplate)(["binary_sensor.s1_zone2_occupancy", "binary_sensor.s2_zone2_occupancy"], "all");
        (0, vitest_1.expect)(result).toContain("and");
    });
});
// ── Room target count ────────────────────────────────────────────
(0, vitest_1.describe)("buildTargetCountTemplate", () => {
    (0, vitest_1.it)("sums 3 sensors' target counts", () => {
        const result = (0, aggregationTemplates_1.buildTargetCountTemplate)([
            "sensor.s1_target_count",
            "sensor.s2_target_count",
            "sensor.s3_target_count",
        ]);
        (0, vitest_1.expect)(result).toContain("sensor.s1_target_count");
        (0, vitest_1.expect)(result).toContain("sensor.s2_target_count");
        (0, vitest_1.expect)(result).toContain("sensor.s3_target_count");
        (0, vitest_1.expect)(result).toContain("float(0)");
        // Result should be an integer (target count is a whole number)
        (0, vitest_1.expect)(result).toContain("int");
    });
    (0, vitest_1.it)("single sensor produces pass-through template", () => {
        const result = (0, aggregationTemplates_1.buildTargetCountTemplate)(["sensor.only_target_count"]);
        (0, vitest_1.expect)(result).toContain("sensor.only_target_count");
        // Pass-through should still use float(0) for safety
        (0, vitest_1.expect)(result).toContain("float(0)");
        (0, vitest_1.expect)(result).toContain("int");
    });
    (0, vitest_1.it)("empty entity list returns constant 0", () => {
        const result = (0, aggregationTemplates_1.buildTargetCountTemplate)([]);
        (0, vitest_1.expect)(result).toBe("0");
    });
    (0, vitest_1.it)("uses has_value guard to filter unavailable entities", () => {
        const result = (0, aggregationTemplates_1.buildTargetCountTemplate)([
            "sensor.s1_target_count",
            "sensor.s2_target_count",
        ]);
        (0, vitest_1.expect)(result).toContain("has_value");
    });
});
// ── Per-zone target count ────────────────────────────────────────
(0, vitest_1.describe)("buildTargetCountTemplate for zone use", () => {
    (0, vitest_1.it)("sums 2 zone target count entities", () => {
        const result = (0, aggregationTemplates_1.buildTargetCountTemplate)([
            "sensor.s1_zone1_target_count",
            "sensor.s2_zone1_target_count",
        ]);
        (0, vitest_1.expect)(result).toContain("sensor.s1_zone1_target_count");
        (0, vitest_1.expect)(result).toContain("sensor.s2_zone1_target_count");
        (0, vitest_1.expect)(result).toContain("float(0)");
    });
});
// ── Environmental ────────────────────────────────────────────────
(0, vitest_1.describe)("buildEnvironmentalTemplate", () => {
    (0, vitest_1.it)("produces average template for 2 sensors", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)(["sensor.s1_temperature", "sensor.s2_temperature"], "average");
        (0, vitest_1.expect)(result).toContain("sensor.s1_temperature");
        (0, vitest_1.expect)(result).toContain("sensor.s2_temperature");
        (0, vitest_1.expect)(result).toContain("has_value");
        (0, vitest_1.expect)(result).toContain("float");
        // Average involves division or avg filter
        (0, vitest_1.expect)(result).toMatch(/\/|average/i);
    });
    (0, vitest_1.it)("produces min template for 3 sensors", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)(["sensor.s1_humidity", "sensor.s2_humidity", "sensor.s3_humidity"], "min");
        (0, vitest_1.expect)(result).toContain("sensor.s1_humidity");
        (0, vitest_1.expect)(result).toContain("sensor.s2_humidity");
        (0, vitest_1.expect)(result).toContain("sensor.s3_humidity");
        (0, vitest_1.expect)(result).toContain("has_value");
        (0, vitest_1.expect)(result).toContain("min");
    });
    (0, vitest_1.it)("produces max template for 2 sensors", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)(["sensor.s1_lux", "sensor.s2_lux"], "max");
        (0, vitest_1.expect)(result).toContain("sensor.s1_lux");
        (0, vitest_1.expect)(result).toContain("sensor.s2_lux");
        (0, vitest_1.expect)(result).toContain("has_value");
        (0, vitest_1.expect)(result).toContain("max");
    });
    (0, vitest_1.it)("single sensor produces pass-through template", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)(["sensor.only_temp"], "average");
        (0, vitest_1.expect)(result).toContain("sensor.only_temp");
        // Pass-through: no aggregation wrapping
        (0, vitest_1.expect)(result).not.toMatch(/\/\s*\w+\s*\|/);
    });
    (0, vitest_1.it)("empty entity list returns constant 0", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)([], "average");
        (0, vitest_1.expect)(result).toBe("0");
    });
    (0, vitest_1.it)("uses has_value guard on multi-sensor environmental", () => {
        const result = (0, aggregationTemplates_1.buildEnvironmentalTemplate)(["sensor.s1_co2", "sensor.s2_co2"], "average");
        (0, vitest_1.expect)(result).toContain("has_value");
    });
});
