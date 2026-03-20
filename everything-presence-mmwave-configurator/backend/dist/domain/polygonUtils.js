"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.polygonToText = polygonToText;
exports.textToPolygon = textToPolygon;
exports.rectToPolygon = rectToPolygon;
exports.polygonToRect = polygonToRect;
exports.isValidPolygon = isValidPolygon;
exports.polygonArea = polygonArea;
exports.polygonCentroid = polygonCentroid;
/**
 * Convert vertices to firmware text format: "x1:y1;x2:y2;..." (mm)
 */
function polygonToText(vertices) {
    if (!vertices || vertices.length === 0) {
        return '';
    }
    return vertices
        .map(v => `${Math.round(v.x)}:${Math.round(v.y)}`)
        .join(';');
}
/**
 * Parse firmware text format into vertices. Returns [] for invalid input.
 */
function textToPolygon(text) {
    if (!text || text.trim() === '') {
        return [];
    }
    const vertices = [];
    const pairs = text.split(';');
    for (const pair of pairs) {
        const match = pair.match(/^(-?\d+):(-?\d+)$/);
        if (match) {
            vertices.push({
                x: parseInt(match[1], 10),
                y: parseInt(match[2], 10),
            });
        }
    }
    return vertices;
}
/**
 * Convert rectangle zone to polygon zone.
 */
function rectToPolygon(rect) {
    const { id, type, x, y, width, height, enabled, label } = rect;
    const vertices = [
        { x: x, y: y },
        { x: x + width, y: y },
        { x: x + width, y: y + height },
        { x: x, y: y + height },
    ];
    return {
        id,
        type,
        vertices,
        enabled,
        label,
    };
}
/**
 * Convert polygon zone to rectangle (bounding box).
 */
function polygonToRect(polygon) {
    const { id, type, vertices, enabled, label } = polygon;
    if (vertices.length === 0) {
        return { id, type, x: 0, y: 0, width: 0, height: 0, enabled, label };
    }
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        id,
        type,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        enabled,
        label,
    };
}
/**
 * Check polygon has at least 3 distinct vertices.
 */
function isValidPolygon(vertices) {
    if (vertices.length < 3) {
        return false;
    }
    const uniquePoints = new Set(vertices.map(v => `${v.x},${v.y}`));
    return uniquePoints.size >= 3;
}
/**
 * Calculate polygon area using shoelace formula.
 */
function polygonArea(vertices) {
    if (vertices.length < 3)
        return 0;
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area) / 2;
}
/**
 * Calculate polygon centroid.
 */
function polygonCentroid(vertices) {
    if (vertices.length === 0) {
        return { x: 0, y: 0 };
    }
    const sumX = vertices.reduce((sum, v) => sum + v.x, 0);
    const sumY = vertices.reduce((sum, v) => sum + v.y, 0);
    return {
        x: sumX / vertices.length,
        y: sumY / vertices.length,
    };
}
