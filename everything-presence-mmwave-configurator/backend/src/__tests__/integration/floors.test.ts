import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, TestApp } from "../helpers/testApp";
import { resetStorage } from "../helpers/tempStorage";

describe("Floors API", () => {
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

	it("GET /api/floors returns empty array initially", async () => {
		const res = await fetch(`${app.baseUrl}/api/floors`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ floors: [] });
	});

	it("POST /api/floors creates a floor", async () => {
		const res = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Ground Floor", level: 0 }),
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.floor).toMatchObject({
			name: "Ground Floor",
			level: 0,
		});
		expect(body.floor.id).toBeTruthy();
	});

	it("POST /api/floors requires name", async () => {
		const res = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ level: 1 }),
		});
		expect(res.status).toBe(400);
	});

	it("GET /api/floors/:id returns a floor", async () => {
		const createRes = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "First Floor", level: 1 }),
		});
		const { floor } = await createRes.json();

		const res = await fetch(`${app.baseUrl}/api/floors/${floor.id}`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.floor.name).toBe("First Floor");
	});

	it("PUT /api/floors/:id updates a floor", async () => {
		const createRes = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Basement", level: -1 }),
		});
		const { floor } = await createRes.json();

		const res = await fetch(`${app.baseUrl}/api/floors/${floor.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Cellar", level: -2 }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.floor.name).toBe("Cellar");
		expect(body.floor.level).toBe(-2);
	});

	it("DELETE /api/floors/:id removes a floor", async () => {
		const createRes = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Attic", level: 2 }),
		});
		const { floor } = await createRes.json();

		const delRes = await fetch(`${app.baseUrl}/api/floors/${floor.id}`, {
			method: "DELETE",
		});
		expect(delRes.status).toBe(200);
		const delBody = await delRes.json();
		expect(delBody).toEqual({ ok: true });

		const getRes = await fetch(`${app.baseUrl}/api/floors/${floor.id}`);
		expect(getRes.status).toBe(404);
	});

	it("rooms can have floorId", async () => {
		// Create a floor
		const floorRes = await fetch(`${app.baseUrl}/api/floors`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Ground Floor", level: 0 }),
		});
		const { floor } = await floorRes.json();

		// Create a room with floorId
		const roomRes = await fetch(`${app.baseUrl}/api/rooms`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Living Room", floorId: floor.id, units: "metric", zones: [] }),
		});
		expect(roomRes.status).toBe(200);
		const roomBody = await roomRes.json();
		expect(roomBody.room.floorId).toBe(floor.id);

		// Fetch it back
		const getRes = await fetch(`${app.baseUrl}/api/rooms/${roomBody.room.id}`);
		const getBody = await getRes.json();
		expect(getBody.room.floorId).toBe(floor.id);
	});
});
