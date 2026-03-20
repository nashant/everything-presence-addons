import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, TestApp } from "../helpers/testApp";
import { resetStorage } from "../helpers/tempStorage";

describe("HA Import API", () => {
	let app: TestApp;

	beforeAll(async () => {
		app = await createTestApp();

		// Seed mock HA with floors and areas
		app.readTransport.addFloor({
			floor_id: "ha_ground",
			name: "Ground Floor",
			level: 0,
			icon: null,
			aliases: [],
		});
		app.readTransport.addFloor({
			floor_id: "ha_first",
			name: "First Floor",
			level: 1,
			icon: null,
			aliases: [],
		});

		app.readTransport.addArea({
			area_id: "ha_kitchen",
			name: "Kitchen",
			picture: null,
			aliases: [],
			floor_id: "ha_ground",
			icon: null,
			labels: [],
		});
		app.readTransport.addArea({
			area_id: "ha_bedroom",
			name: "Bedroom",
			picture: null,
			aliases: [],
			floor_id: "ha_first",
			icon: null,
			labels: [],
		});
		app.readTransport.addArea({
			area_id: "ha_garage",
			name: "Garage",
			picture: null,
			aliases: [],
			floor_id: null,
			icon: null,
			labels: [],
		});
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		resetStorage();
	});

	it("POST /api/import/ha imports floors and rooms", async () => {
		const res = await fetch(`${app.baseUrl}/api/import/ha`, {
			method: "POST",
		});
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body.floors.imported).toBe(2);
		expect(body.floors.skipped).toBe(0);
		expect(body.rooms.imported).toBe(3);
		expect(body.rooms.skipped).toBe(0);

		// Verify floors were created
		const floorsRes = await fetch(`${app.baseUrl}/api/floors`);
		const floorsBody = await floorsRes.json();
		expect(floorsBody.floors).toHaveLength(2);
		expect(floorsBody.floors.map((f: any) => f.name).sort()).toEqual([
			"First Floor",
			"Ground Floor",
		]);

		// Verify rooms were created with correct floorIds
		const roomsRes = await fetch(`${app.baseUrl}/api/rooms`);
		const roomsBody = await roomsRes.json();
		expect(roomsBody.rooms).toHaveLength(3);

		const kitchen = roomsBody.rooms.find((r: any) => r.name === "Kitchen");
		const bedroom = roomsBody.rooms.find((r: any) => r.name === "Bedroom");
		const garage = roomsBody.rooms.find((r: any) => r.name === "Garage");

		expect(kitchen).toBeTruthy();
		expect(bedroom).toBeTruthy();
		expect(garage).toBeTruthy();

		// Kitchen should be on ground floor, bedroom on first floor
		const groundFloor = floorsBody.floors.find((f: any) => f.name === "Ground Floor");
		const firstFloor = floorsBody.floors.find((f: any) => f.name === "First Floor");
		expect(kitchen.floorId).toBe(groundFloor.id);
		expect(bedroom.floorId).toBe(firstFloor.id);

		// Garage has no floor
		expect(garage.floorId).toBeUndefined();

		// Rooms should not have a deviceId (room-first)
		expect(kitchen.deviceId).toBeUndefined();
	});

	it("POST /api/import/ha skips duplicates on re-import", async () => {
		// First import
		await fetch(`${app.baseUrl}/api/import/ha`, { method: "POST" });

		// Second import — should skip all
		const res = await fetch(`${app.baseUrl}/api/import/ha`, { method: "POST" });
		const body = await res.json();

		expect(body.floors.imported).toBe(0);
		expect(body.floors.skipped).toBe(2);
		expect(body.rooms.imported).toBe(0);
		expect(body.rooms.skipped).toBe(3);

		// Still same counts
		const floorsRes = await fetch(`${app.baseUrl}/api/floors`);
		const floorsBody = await floorsRes.json();
		expect(floorsBody.floors).toHaveLength(2);

		const roomsRes = await fetch(`${app.baseUrl}/api/rooms`);
		const roomsBody = await roomsRes.json();
		expect(roomsBody.rooms).toHaveLength(3);
	});

	it("POST /api/import/ha maps to existing floors by name", async () => {
		// Pre-create a floor with the same name
		await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Ground Floor", level: 0 }),
		});

		const res = await fetch(`${app.baseUrl}/api/import/ha`, { method: "POST" });
		const body = await res.json();

		// Ground floor skipped (already exists), First Floor imported
		expect(body.floors.imported).toBe(1);
		expect(body.floors.skipped).toBe(1);

		// Kitchen should still get the existing floor's id
		const floorsRes = await fetch(`${app.baseUrl}/api/floors`);
		const floorsBody = await floorsRes.json();
		const groundFloor = floorsBody.floors.find((f: any) => f.name === "Ground Floor");

		const roomsRes = await fetch(`${app.baseUrl}/api/rooms`);
		const roomsBody = await roomsRes.json();
		const kitchen = roomsBody.rooms.find((r: any) => r.name === "Kitchen");
		expect(kitchen.floorId).toBe(groundFloor.id);
	});
});
