"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsRouter = void 0;
const express_1 = require("express");
const storage_1 = require("../config/storage");
const createSettingsRouter = () => {
    const router = (0, express_1.Router)();
    router.get('/', (_req, res) => {
        const settings = storage_1.storage.getSettings();
        res.json({ settings });
    });
    router.put('/', (req, res) => {
        const nextSettings = {};
        if (typeof req.body?.wizardCompleted === 'boolean') {
            nextSettings.wizardCompleted = req.body.wizardCompleted;
        }
        if (typeof req.body?.wizardStep === 'string') {
            nextSettings.wizardStep = req.body.wizardStep;
        }
        if (typeof req.body?.outlineDone === 'boolean') {
            nextSettings.outlineDone = req.body.outlineDone;
        }
        if (typeof req.body?.placementDone === 'boolean') {
            nextSettings.placementDone = req.body.placementDone;
        }
        if (typeof req.body?.zonesReady === 'boolean') {
            nextSettings.zonesReady = req.body.zonesReady;
        }
        if (typeof req.body?.defaultRoomId === 'string') {
            nextSettings.defaultRoomId = req.body.defaultRoomId;
        }
        else if (req.body?.defaultRoomId === null) {
            nextSettings.defaultRoomId = null;
        }
        const next = storage_1.storage.saveSettings(nextSettings);
        res.json({ settings: next });
    });
    return router;
};
exports.createSettingsRouter = createSettingsRouter;
