"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
// Set DATA_DIR to an isolated temp directory BEFORE any app module is imported.
// storage.ts and deviceMappingStorage.ts resolve DATA_DIR at module load time,
// so this must happen first.
const tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "ep-test-"));
process.env.DATA_DIR = tmpDir;
