"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createZonesRouter = void 0;
const express_1 = require("express");
const createZonesRouter = () => {
    const router = (0, express_1.Router)();
    router.post('/validate', (req, res) => {
        const zones = req.body?.zones ?? [];
        return res.json({ ok: true });
    });
    return router;
};
exports.createZonesRouter = createZonesRouter;
