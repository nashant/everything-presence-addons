"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetry = void 0;
const logger_1 = require("../logger");
exports.telemetry = {
    conflict(templateKey, candidates) {
        logger_1.logger.info({ templateKey, candidates }, 'Entity match conflict detected');
    },
    validationFail(deviceId, errors) {
        logger_1.logger.warn({ deviceId, errorCount: errors.length, sample: errors.slice(0, 5) }, 'Mapping validation failed');
    },
    validationSuccess(deviceId) {
        logger_1.logger.debug({ deviceId }, 'Mapping validation succeeded');
    },
    overwriteAttempt(deviceId, key, from, to) {
        logger_1.logger.info({ deviceId, key, from, to }, 'Mapping overwrite attempt');
    },
};
