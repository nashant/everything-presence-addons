"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZonePolygon = isZonePolygon;
exports.isZoneRect = isZoneRect;
// Type guard to check if a zone is a polygon
function isZonePolygon(zone) {
    return 'vertices' in zone;
}
// Type guard to check if a zone is a rectangle
function isZoneRect(zone) {
    return 'width' in zone && 'height' in zone;
}
