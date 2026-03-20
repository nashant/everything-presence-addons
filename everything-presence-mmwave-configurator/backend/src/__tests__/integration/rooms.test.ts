import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, TestApp } from "../helpers/testApp";
import { resetStorage } from "../helpers/tempStorage";

describe("Rooms API", () => {
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

	it("GET /api/rooms returns empty array initially", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ rooms: [] });
	});

	it("POST /api/rooms creates a room", async () => {
		const res = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Living Room" }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.room.name).toBe("Living Room");
		expect(body.room.id).toBeDefined();
		expect(body.room.units).toBe("metric");
	});

	it("GET /api/rooms/:id returns created room", async () => {
		// Create
		const createRes = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Bedroom" }),
		});
		const { room } = await createRes.json();

		// Fetch
		const getRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`);
		expect(getRes.status).toBe(200);
		const body = await getRes.json();
		expect(body.room.name).toBe("Bedroom");
	});

	it("DELETE /api/rooms/:id removes room", async () => {
		// Create
		const createRes = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Office" }),
		});
		const { room } = await createRes.json();

		// Delete
		const delRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`, {
			method: "DELETE",
		});
		expect(delRes.status).toBe(200);

		// Verify gone
		const getRes = await fetch(`${app.baseUrl}/api/rooms/${room.id}`);
		expect(getRes.status).toBe(404);
	});

	it("GET /api/health returns ok", async () => {
		const res = await fetch(`${app.baseUrl}/api/health`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ status: "ok" });
	});

	it("GET /api/devices/profiles returns profiles", async () => {
		const res = await fetch(`${app.baseUrl}/api/devices/profiles`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.profiles).toBeDefined();
		expect(body.profiles.length).toBeGreaterThanOrEqual(3);
	});
});
