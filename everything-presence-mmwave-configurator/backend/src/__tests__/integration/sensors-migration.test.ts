import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, TestApp } from "../helpers/testApp";
import { resetStorage } from "../helpers/tempStorage";
import { storage } from "../../config/storage";
import { migrateSensorsArray } from "../../domain/sensorMigration";
import type { RoomConfig } from "../../domain/types";

describe("Multi-sensor data model", () => {
	let app: TestApp;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		resetStorage();
	});

	// ── POST with sensors[] ────────────────────────────────────────

	it("POST with sensors[] returns sensors and backfills legacy fields", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Multi-sensor room",
				sensors: [
					{ deviceId: "dev-1", profileId: "ep1", placement: { x: 100, y: 200, rotationDeg: 90 } },
					{ deviceId: "dev-2", profileId: "epl", placement: { x: 500, y: 600 } },
				],
			}),
		});
		expect(res.status).toBe(200);
		const { room } = await res.json();

		// sensors[] preserved
		expect(room.sensors).toHaveLength(2);
		expect(room.sensors[0].deviceId).toBe("dev-1");
		expect(room.sensors[0].profileId).toBe("ep1");
		expect(room.sensors[0].placement).toEqual({ x: 100, y: 200, rotationDeg: 90 });
		expect(room.sensors[1].deviceId).toBe("dev-2");

		// Legacy fields backfilled from sensors[0]
		expect(room.deviceId).toBe("dev-1");
		expect(room.profileId).toBe("ep1");
		expect(room.devicePlacement).toEqual({ x: 100, y: 200, rotationDeg: 90 });
	});

	// ── POST with legacy deviceId (no sensors) ────────────────────

	it("POST with legacy deviceId synthesizes sensors[0]", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Legacy room",
				deviceId: "dev-legacy",
				profileId: "ep1",
				devicePlacement: { x: 50, y: 75, rotationDeg: 180 },
			}),
		});
		expect(res.status).toBe(200);
		const { room } = await res.json();

		// sensors[0] synthesized from legacy fields
		expect(room.sensors).toHaveLength(1);
		expect(room.sensors[0].deviceId).toBe("dev-legacy");
		expect(room.sensors[0].profileId).toBe("ep1");
		expect(room.sensors[0].placement).toEqual({ x: 50, y: 75, rotationDeg: 180 });

		// Legacy fields preserved
		expect(room.deviceId).toBe("dev-legacy");
		expect(room.profileId).toBe("ep1");
	});

	// ── POST with both sensors[] and deviceId → sensors wins ──────

	it("POST with both sensors[] and deviceId → sensors[] wins", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Both provided",
				deviceId: "legacy-id",
				sensors: [
					{ deviceId: "sensor-id", profileId: "epl" },
				],
			}),
		});
		expect(res.status).toBe(200);
		const { room } = await res.json();

		expect(room.sensors).toHaveLength(1);
		expect(room.sensors[0].deviceId).toBe("sensor-id");
		// Legacy backfilled from sensors[0], not from the raw deviceId
		expect(room.deviceId).toBe("sensor-id");
		expect(room.profileId).toBe("epl");
	});

	// ── POST with no device at all ────────────────────────────────

	it("POST with no device info → no sensors, no legacy fields", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Empty room" }),
		});
		expect(res.status).toBe(200);
		const { room } = await res.json();

		expect(room.sensors).toBeUndefined();
		expect(room.deviceId).toBeUndefined();
		expect(room.profileId).toBeUndefined();
		expect(room.devicePlacement).toBeUndefined();
	});

	// ── PUT updates sensors[] ─────────────────────────────────────

	it("PUT with sensors[] updates and backfills legacy", async () => {
		// Create with one sensor
		const createRes = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Update test",
				sensors: [{ deviceId: "dev-1", placement: { x: 0, y: 0 } }],
			}),
		});
		const { room: created } = await createRes.json();

		// Update with two sensors
		const updateRes = await fetch(`${app.baseUrl}/api/rooms/${created.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sensors: [
					{ deviceId: "dev-1", placement: { x: 100, y: 100 } },
					{ deviceId: "dev-2", placement: { x: 500, y: 500 } },
				],
			}),
		});
		expect(updateRes.status).toBe(200);
		const { room: updated } = await updateRes.json();

		expect(updated.sensors).toHaveLength(2);
		expect(updated.deviceId).toBe("dev-1"); // backfilled from sensors[0]
		expect(updated.devicePlacement).toEqual({ x: 100, y: 100 });
	});

	// ── GET returns sensors[] ─────────────────────────────────────

	it("GET /api/rooms returns rooms with sensors[]", async () => {
		await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Room A",
				sensors: [{ deviceId: "dev-a" }],
			}),
		});

		const res = await fetch(`${app.baseUrl}/api/rooms`);
		const { rooms } = await res.json();
		expect(rooms).toHaveLength(1);
		expect(rooms[0].sensors).toHaveLength(1);
		expect(rooms[0].sensors[0].deviceId).toBe("dev-a");
		expect(rooms[0].deviceId).toBe("dev-a");
	});

	// ── Startup migration ─────────────────────────────────────────

	describe("migrateSensorsArray()", () => {
		it("migrates legacy room (deviceId, no sensors) to sensors[0]", () => {
			// Write a legacy room directly to storage (bypass normalizeRoom)
			const legacy: RoomConfig = {
				id: "room-legacy",
				name: "Legacy",
				deviceId: "dev-old",
				profileId: "ep1",
				units: "metric",
				zones: [],
				devicePlacement: { x: 100, y: 200, rotationDeg: 45 },
			};
			storage.saveRoom(legacy);

			const result = migrateSensorsArray();
			expect(result.migratedCount).toBe(1);
			expect(result.skippedCount).toBe(0);

			const migrated = storage.getRoom("room-legacy")!;
			expect(migrated.sensors).toHaveLength(1);
			expect(migrated.sensors![0].deviceId).toBe("dev-old");
			expect(migrated.sensors![0].profileId).toBe("ep1");
			expect(migrated.sensors![0].placement).toEqual({ x: 100, y: 200, rotationDeg: 45 });
		});

		it("skips rooms that already have sensors[]", () => {
			const modern: RoomConfig = {
				id: "room-modern",
				name: "Modern",
				deviceId: "dev-1",
				units: "metric",
				zones: [],
				sensors: [{ deviceId: "dev-1" }],
			};
			storage.saveRoom(modern);

			const result = migrateSensorsArray();
			expect(result.migratedCount).toBe(0);
			expect(result.skippedCount).toBe(1);
		});

		it("skips rooms with no deviceId", () => {
			const empty: RoomConfig = {
				id: "room-empty",
				name: "Empty",
				units: "metric",
				zones: [],
			};
			storage.saveRoom(empty);

			const result = migrateSensorsArray();
			expect(result.migratedCount).toBe(0);
			expect(result.skippedCount).toBe(1);
		});

		it("is idempotent — second run migrates nothing", () => {
			const legacy: RoomConfig = {
				id: "room-idem",
				name: "Idempotent",
				deviceId: "dev-x",
				units: "metric",
				zones: [],
			};
			storage.saveRoom(legacy);

			migrateSensorsArray();
			const result2 = migrateSensorsArray();
			expect(result2.migratedCount).toBe(0);
			expect(result2.skippedCount).toBe(1);
		});
	});
});
