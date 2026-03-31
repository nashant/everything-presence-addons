/**
 * Zone-to-device slot assignment engine.
 *
 * Pure functions — no side effects, no HA/backend dependencies.
 *
 * Maps room-level zones to specific device zone slots, respecting per-profile
 * slot limits and coverage thresholds. EP One devices (maxZones=0) are
 * excluded entirely per R012.
 *
 * Slot pools:
 *   regular  → zone1, zone2, zone3, zone4       (capped by maxZones)
 *   exclusion → exclusion1, exclusion2           (capped by maxExclusionZones)
 *   entry    → entry1, entry2                    (capped by maxEntryZones)
 *
 * All coordinates are in mm. Coverage matrix comes from zoneCoverage.ts.
 */

import type { Zone, DevicePlacement } from "./types";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

/** Device zone slot identifiers. */
export type SlotId =
	| "zone1"
	| "zone2"
	| "zone3"
	| "zone4"
	| "exclusion1"
	| "exclusion2"
	| "entry1"
	| "entry2";

/** A single zone → device slot mapping. */
export interface ZoneAssignment {
	zoneId: string;
	sensorDeviceId: string;
	slotId: SlotId;
	coverage: number;
}

/** An unassigned zone with the reason it wasn't placed. */
export interface UnassignedZone {
	zoneId: string;
	reason: string;
}

/** Complete assignment result. */
export interface AssignmentResult {
	assignments: ZoneAssignment[];
	unassigned: UnassignedZone[];
	warnings: string[];
}

/** Sensor profile data needed for assignment. */
export interface SensorProfile {
	deviceId: string;
	placement: DevicePlacement;
	maxZones: number;
	maxExclusionZones: number;
	maxEntryZones: number;
	fovDeg: number;
	maxRangeMm: number;
}

// ─────────────────────────────────────────────────────────────────
// Slot pool definitions
// ─────────────────────────────────────────────────────────────────

const REGULAR_SLOTS: SlotId[] = ["zone1", "zone2", "zone3", "zone4"];
const EXCLUSION_SLOTS: SlotId[] = ["exclusion1", "exclusion2"];
const ENTRY_SLOTS: SlotId[] = ["entry1", "entry2"];

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Return the ordered list of slots still available for a zone type on a
 * given sensor profile, considering already-used slots and profile caps.
 */
export function getAvailableSlots(
	zoneType: Zone["type"],
	profile: SensorProfile,
	usedSlots: Set<SlotId>,
): SlotId[] {
	let pool: SlotId[];
	let cap: number;

	switch (zoneType) {
		case "regular":
			pool = REGULAR_SLOTS;
			cap = profile.maxZones;
			break;
		case "exclusion":
			pool = EXCLUSION_SLOTS;
			cap = profile.maxExclusionZones;
			break;
		case "entry":
			pool = ENTRY_SLOTS;
			cap = profile.maxEntryZones;
			break;
		default: {
			// Exhaustiveness guard — should never reach here with typed Zone['type']
			const _exhaustive: never = zoneType;
			return _exhaustive;
		}
	}

	// Respect the profile cap: only consider slots up to the cap
	const capped = pool.slice(0, cap);
	return capped.filter((slot) => !usedSlots.has(slot));
}

// ─────────────────────────────────────────────────────────────────
// Main assignment
// ─────────────────────────────────────────────────────────────────

/**
 * Assign room zones to device slots across all sensors.
 *
 * For each zone, finds sensors whose coverage meets the threshold, then
 * allocates the next available slot in the matching pool. A zone can be
 * assigned to multiple sensors if they both cover it.
 *
 * @param zones            - Room zones to assign
 * @param sensors          - Sensor profiles with placement and limits
 * @param coverageMatrix   - [zoneIndex][sensorIndex] coverage fractions from computeAllCoverage
 * @param overlapThreshold - Minimum coverage fraction to consider a sensor (default 0.1 = 10%)
 */
export function assignZonesToDevices(
	zones: Zone[],
	sensors: SensorProfile[],
	coverageMatrix: number[][],
	overlapThreshold: number = 0.1,
): AssignmentResult {
	const assignments: ZoneAssignment[] = [];
	const unassigned: UnassignedZone[] = [];
	const warnings: string[] = [];

	// Track used slots per sensor: sensorIndex → Set<SlotId>
	const usedSlotsBySensor: Map<number, Set<SlotId>> = new Map();
	for (let si = 0; si < sensors.length; si++) {
		usedSlotsBySensor.set(si, new Set());
	}

	for (let zi = 0; zi < zones.length; zi++) {
		const zone = zones[zi];
		const coverageRow = coverageMatrix[zi] ?? [];
		let assigned = false;

		// Build list of qualifying sensors, sorted by coverage descending
		const qualifying: Array<{ sensorIndex: number; coverage: number }> = [];
		// Track coverage from sensors that actually have capacity for this zone type
		const eligibleCoverages: number[] = [];
		for (let si = 0; si < sensors.length; si++) {
			const sensor = sensors[si];
			const coverage = coverageRow[si] ?? 0;

			// Skip EP One and similar devices with no zone capacity at all
			if (
				sensor.maxZones === 0 &&
				sensor.maxExclusionZones === 0 &&
				sensor.maxEntryZones === 0
			) {
				continue;
			}

			eligibleCoverages.push(coverage);
			if (coverage >= overlapThreshold) {
				qualifying.push({ sensorIndex: si, coverage });
			}
		}

		// Sort by coverage descending — assign to best-covering sensors first
		qualifying.sort((a, b) => b.coverage - a.coverage);

		for (const { sensorIndex, coverage } of qualifying) {
			const sensor = sensors[sensorIndex];
			const usedSlots = usedSlotsBySensor.get(sensorIndex)!;
			const available = getAvailableSlots(zone.type, sensor, usedSlots);

			if (available.length === 0) {
				warnings.push(
					`Sensor ${sensor.deviceId}: no available ${zone.type} slots for zone "${zone.id}" (pool full)`,
				);
				continue;
			}

			const slotId = available[0];
			usedSlots.add(slotId);

			assignments.push({
				zoneId: zone.id,
				sensorDeviceId: sensor.deviceId,
				slotId,
				coverage,
			});
			assigned = true;
		}

		if (!assigned) {
			// Determine why — only consider eligible sensors (non-excluded)
			const hasAnyCoverage = eligibleCoverages.some((c) => c > 0);
			if (sensors.length === 0 || eligibleCoverages.length === 0) {
				unassigned.push({
					zoneId: zone.id,
					reason: sensors.length === 0
						? "No sensors available"
						: "No sensor covers this zone",
				});
			} else if (!hasAnyCoverage) {
				unassigned.push({
					zoneId: zone.id,
					reason: "No sensor covers this zone",
				});
			} else {
				// Coverage exists but below threshold or all slot pools full
				const maxCov = Math.max(...eligibleCoverages);
				if (maxCov < overlapThreshold) {
					unassigned.push({
						zoneId: zone.id,
						reason: `Best coverage ${(maxCov * 100).toFixed(1)}% is below threshold ${(overlapThreshold * 100).toFixed(1)}%`,
					});
				} else {
					unassigned.push({
						zoneId: zone.id,
						reason: "All qualifying sensors have full slot pools for this zone type",
					});
				}
			}
		}
	}

	return { assignments, unassigned, warnings };
}
