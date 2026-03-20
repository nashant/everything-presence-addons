"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceToRoom = deviceToRoom;
exports.roomToDevice = roomToDevice;
exports.transformZoneRectToDevice = transformZoneRectToDevice;
exports.transformZonePolygonToDevice = transformZonePolygonToDevice;
/**
 * Compute the effective rotation in degrees for a placement.
 * This combines the device's rotationDeg with the installation angle.
 * An explicit installationAngle parameter takes priority over placement.installationAngle.
 */
function effectiveRotation(placement, installationAngle) {
    return (placement.rotationDeg ?? 0) + (installationAngle ?? placement.installationAngle ?? 0);
}
/**
 * Transform device-relative coordinates to room-space coordinates.
 * Rotates by the effective angle then translates by the device position.
 */
function deviceToRoom(dx, dy, placement, installationAngle) {
    const angleRad = effectiveRotation(placement, installationAngle) * (Math.PI / 180);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: dx * cos - dy * sin + placement.x,
        y: dx * sin + dy * cos + placement.y,
    };
}
/**
 * Transform room-space coordinates back to device-relative coordinates.
 * Inverse of deviceToRoom: translate then rotate by the negative angle.
 */
function roomToDevice(rx, ry, placement, installationAngle) {
    const tx = rx - placement.x;
    const ty = ry - placement.y;
    const angleRad = -effectiveRotation(placement, installationAngle) * (Math.PI / 180);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: tx * cos - ty * sin,
        y: tx * sin + ty * cos,
    };
}
/**
 * Transform a room-space rectangle zone to device-space.
 *
 * Because the hardware only accepts axis-aligned rectangles
 * (beginX/endX/beginY/endY), this computes the bounding box of the
 * rotated rectangle corners — lossy when rotation is not axis-aligned.
 */
function transformZoneRectToDevice(zone, placement, installationAngle) {
    // Four corners in room-space
    const corners = [
        { x: zone.x, y: zone.y },
        { x: zone.x + zone.width, y: zone.y },
        { x: zone.x + zone.width, y: zone.y + zone.height },
        { x: zone.x, y: zone.y + zone.height },
    ];
    // Transform each corner to device-space
    const deviceCorners = corners.map((c) => roomToDevice(c.x, c.y, placement, installationAngle));
    // Axis-aligned bounding box
    const xs = deviceCorners.map((c) => c.x);
    const ys = deviceCorners.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        ...zone,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}
/**
 * Transform a room-space polygon zone to device-space.
 * Each vertex is transformed individually — exact (no bounding-box loss).
 */
function transformZonePolygonToDevice(zone, placement, installationAngle) {
    return {
        ...zone,
        vertices: zone.vertices.map((v) => roomToDevice(v.x, v.y, placement, installationAngle)),
    };
}
