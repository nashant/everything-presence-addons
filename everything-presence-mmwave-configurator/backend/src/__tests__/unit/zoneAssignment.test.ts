import { describe, it, expect } from "vitest";
import {
	assignZonesToDevices,
	getAvailableSlots,
	type SensorProfile,
	type SlotId,
} from "../../domain/zoneAssignment";
import type { Zone, ZoneRect } from "../../domain/types";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Build a simple rectangular zone for testing. */
function makeZone(
	id: string,
	type: Zone["type"] = "regular",
): ZoneRect {
	return { id, type, x: 1000, y: 1000, width: 500, height: 500 };
}

/** EP Lite profile: 4 regular, 2 exclusion, 2 entry. */
function makeLiteSensor(deviceId: string = "lite-1"): SensorProfile {
	return {
		deviceId,
		placement: { x: 0, y: 0, rotationDeg: 0 },
		maxZones: 4,
		maxExclusionZones: 2,
		maxEntryZones: 2,
		fovDeg: 120,
		maxRangeMm: 6000,
	};
}

/** EP Pro profile: 4 regular, 2 exclusion, 0 entry. */
function makeProSensor(deviceId: string = "pro-1"): SensorProfile {
	return {
		deviceId,
		placement: { x: 0, y: 0, rotationDeg: 0 },
		maxZones: 4,
		maxExclusionZones: 2,
		maxEntryZones: 0,
		fovDeg: 120,
		maxRangeMm: 6000,
	};
}

/** EP One profile: 0 regular, 0 exclusion, 0 entry — excluded entirely. */
function makeOneSensor(deviceId: string = "one-1"): SensorProfile {
	return {
		deviceId,
		placement: { x: 0, y: 0, rotationDeg: 0 },
		maxZones: 0,
		maxExclusionZones: 0,
		maxEntryZones: 0,
		fovDeg: 120,
		maxRangeMm: 25000,
	};
}

// ─────────────────────────────────────────────────────────────────
// getAvailableSlots
// ─────────────────────────────────────────────────────────────────

describe("getAvailableSlots", () => {
	it("returns regular slots up to maxZones cap", () => {
		const sensor = makeLiteSensor();
		const used = new Set<SlotId>();
		const available = getAvailableSlots("regular", sensor, used);
		expect(available).toEqual(["zone1", "zone2", "zone3", "zone4"]);
	});

	it("excludes already-used slots", () => {
		const sensor = makeLiteSensor();
		const used = new Set<SlotId>(["zone1", "zone3"]);
		const available = getAvailableSlots("regular", sensor, used);
		expect(available).toEqual(["zone2", "zone4"]);
	});

	it("returns exclusion slots capped by maxExclusionZones", () => {
		const sensor = makeLiteSensor();
		const available = getAvailableSlots("exclusion", sensor, new Set());
		expect(available).toEqual(["exclusion1", "exclusion2"]);
	});

	it("returns entry slots capped by maxEntryZones", () => {
		const sensor = makeLiteSensor();
		const available = getAvailableSlots("entry", sensor, new Set());
		expect(available).toEqual(["entry1", "entry2"]);
	});

	it("returns empty array when maxZones is 0 (EP One)", () => {
		const sensor = makeOneSensor();
		const available = getAvailableSlots("regular", sensor, new Set());
		expect(available).toEqual([]);
	});

	it("returns empty array when EP Pro has 0 entry slots", () => {
		const sensor = makeProSensor();
		const available = getAvailableSlots("entry", sensor, new Set());
		expect(available).toEqual([]);
	});

	it("returns empty array when all slots in pool are used", () => {
		const sensor = makeLiteSensor();
		const used = new Set<SlotId>(["zone1", "zone2", "zone3", "zone4"]);
		const available = getAvailableSlots("regular", sensor, used);
		expect(available).toEqual([]);
	});
});

// ─────────────────────────────────────────────────────────────────
// assignZonesToDevices — single sensor
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — single sensor", () => {
	it("assigns all zones to sequential slots when one sensor covers everything", () => {
		const zones = [makeZone("z1"), makeZone("z2"), makeZone("z3"), makeZone("z4")];
		const sensors = [makeLiteSensor()];
		// Full coverage for all zones
		const coverageMatrix = [[1.0], [0.8], [0.6], [0.3]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(4);
		expect(result.unassigned).toHaveLength(0);
		expect(result.assignments.map((a) => a.slotId)).toEqual([
			"zone1",
			"zone2",
			"zone3",
			"zone4",
		]);
		// Verify coverage values pass through
		expect(result.assignments[0].coverage).toBe(1.0);
		expect(result.assignments[3].coverage).toBe(0.3);
	});

	it("puts 5th regular zone into unassigned when slot pool is full", () => {
		const zones = [
			makeZone("z1"),
			makeZone("z2"),
			makeZone("z3"),
			makeZone("z4"),
			makeZone("z5"),
		];
		const sensors = [makeLiteSensor()];
		const coverageMatrix = [[1.0], [1.0], [1.0], [1.0], [1.0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(4);
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0].zoneId).toBe("z5");
		expect(result.unassigned[0].reason).toContain("full slot pools");
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────
// assignZonesToDevices — multi-sensor overlap
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — multi-sensor", () => {
	it("assigns same zone to multiple sensors that cover it", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor("lite-1"), makeLiteSensor("lite-2")];
		// Both sensors cover zone z1
		const coverageMatrix = [[0.9, 0.7]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(2);
		expect(result.unassigned).toHaveLength(0);

		const sensorIds = result.assignments.map((a) => a.sensorDeviceId);
		expect(sensorIds).toContain("lite-1");
		expect(sensorIds).toContain("lite-2");

		// Each gets zone1 slot on their respective device
		for (const a of result.assignments) {
			expect(a.slotId).toBe("zone1");
		}
	});

	it("assigns to best-covering sensor first", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor("low-cov"), makeLiteSensor("high-cov")];
		const coverageMatrix = [[0.3, 0.95]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		// Both qualify, but high-cov should appear first in assignments (sorted by coverage)
		expect(result.assignments[0].sensorDeviceId).toBe("high-cov");
		expect(result.assignments[1].sensorDeviceId).toBe("low-cov");
	});
});

// ─────────────────────────────────────────────────────────────────
// Coverage threshold filtering
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — threshold", () => {
	it("marks zone as unassigned when coverage is below default 10% threshold", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor()];
		const coverageMatrix = [[0.05]]; // 5% — below default 10%

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0].reason).toContain("below threshold");
		expect(result.unassigned[0].reason).toContain("5.0%");
	});

	it("applies custom threshold correctly", () => {
		const zones = [makeZone("z1"), makeZone("z2")];
		const sensors = [makeLiteSensor()];
		// z1 has 40% coverage, z2 has 60% coverage. Threshold 0.5 filters out z1.
		const coverageMatrix = [[0.4], [0.6]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix, 0.5);

		expect(result.assignments).toHaveLength(1);
		expect(result.assignments[0].zoneId).toBe("z2");
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0].zoneId).toBe("z1");
	});
});

// ─────────────────────────────────────────────────────────────────
// EP One exclusion (R012)
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — EP One exclusion", () => {
	it("completely skips EP One sensors (maxZones=0, all pools=0)", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeOneSensor()];
		const coverageMatrix = [[1.0]]; // Full coverage, but device can't host zones

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(1);
		// Should not produce errors, just unassigned
		expect(result.unassigned[0].reason).toContain("No sensor covers");
	});

	it("assigns to Lite sensor when both EP One and Lite are present", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeOneSensor("one"), makeLiteSensor("lite")];
		const coverageMatrix = [[1.0, 0.8]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(1);
		expect(result.assignments[0].sensorDeviceId).toBe("lite");
		expect(result.assignments[0].slotId).toBe("zone1");
	});
});

// ─────────────────────────────────────────────────────────────────
// Zone type routing to correct slot pools
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — zone type routing", () => {
	it("routes exclusion zones to exclusion slots, not regular slots", () => {
		const zones = [makeZone("ex1", "exclusion"), makeZone("ex2", "exclusion")];
		const sensors = [makeLiteSensor()];
		const coverageMatrix = [[1.0], [1.0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(2);
		expect(result.assignments[0].slotId).toBe("exclusion1");
		expect(result.assignments[1].slotId).toBe("exclusion2");
	});

	it("routes entry zones to entry slots, not regular slots", () => {
		const zones = [makeZone("en1", "entry"), makeZone("en2", "entry")];
		const sensors = [makeLiteSensor()];
		const coverageMatrix = [[1.0], [1.0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(2);
		expect(result.assignments[0].slotId).toBe("entry1");
		expect(result.assignments[1].slotId).toBe("entry2");
	});

	it("allocates mixed zone types from separate pools", () => {
		const zones = [
			makeZone("r1", "regular"),
			makeZone("ex1", "exclusion"),
			makeZone("en1", "entry"),
			makeZone("r2", "regular"),
		];
		const sensors = [makeLiteSensor()];
		const coverageMatrix = [[1.0], [1.0], [1.0], [1.0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(4);
		expect(result.unassigned).toHaveLength(0);

		const byZone = Object.fromEntries(result.assignments.map((a) => [a.zoneId, a.slotId]));
		expect(byZone["r1"]).toBe("zone1");
		expect(byZone["r2"]).toBe("zone2");
		expect(byZone["ex1"]).toBe("exclusion1");
		expect(byZone["en1"]).toBe("entry1");
	});

	it("EP Pro with 0 entry zones puts entry zones in unassigned", () => {
		const zones = [makeZone("en1", "entry")];
		const sensors = [makeProSensor()];
		const coverageMatrix = [[1.0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0].zoneId).toBe("en1");
		expect(result.unassigned[0].reason).toContain("full slot pools");
	});
});

// ─────────────────────────────────────────────────────────────────
// Empty / edge-case inputs
// ─────────────────────────────────────────────────────────────────

describe("assignZonesToDevices — edge cases", () => {
	it("returns empty result when no zones are provided", () => {
		const sensors = [makeLiteSensor()];
		const coverageMatrix: number[][] = [];

		const result = assignZonesToDevices([], sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("marks all zones as unassigned when no sensors are provided", () => {
		const zones = [makeZone("z1"), makeZone("z2")];
		const coverageMatrix: number[][] = [[], []];

		const result = assignZonesToDevices(zones, [], coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(2);
		expect(result.unassigned[0].reason).toBe("No sensors available");
		expect(result.unassigned[1].reason).toBe("No sensors available");
	});

	it("handles zone with zero coverage from all sensors", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor(), makeLiteSensor("lite-2")];
		const coverageMatrix = [[0, 0]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0].reason).toContain("No sensor covers");
	});

	it("handles missing coverage row gracefully", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor()];
		// Coverage matrix is empty — missing row for zone
		const coverageMatrix: number[][] = [];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		expect(result.assignments).toHaveLength(0);
		expect(result.unassigned).toHaveLength(1);
	});

	it("handles coverage matrix with fewer columns than sensors", () => {
		const zones = [makeZone("z1")];
		const sensors = [makeLiteSensor(), makeLiteSensor("lite-2")];
		// Only one coverage value, but two sensors
		const coverageMatrix = [[0.9]];

		const result = assignZonesToDevices(zones, sensors, coverageMatrix);

		// First sensor assigned, second has coverage 0 (undefined → 0 via ?? 0)
		expect(result.assignments).toHaveLength(1);
		expect(result.assignments[0].sensorDeviceId).toBe("lite-1");
	});
});
