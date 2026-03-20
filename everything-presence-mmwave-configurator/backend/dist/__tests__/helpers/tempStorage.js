"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetStorage = resetStorage;
const fs_1 = __importDefault(require("fs"));
/**
 * Delete all files inside DATA_DIR so the next test starts with clean storage.
 * Leaves the directory itself intact (storage.ts will re-create files as needed).
 */
function resetStorage() {
    const dir = process.env.DATA_DIR;
    if (!dir)
        return;
    if (fs_1.default.existsSync(dir)) {
        for (const entry of fs_1.default.readdirSync(dir)) {
            const fullPath = `${dir}/${entry}`;
            const stat = fs_1.default.statSync(fullPath);
            if (stat.isDirectory()) {
                fs_1.default.rmSync(fullPath, { recursive: true, force: true });
            }
            else {
                fs_1.default.unlinkSync(fullPath);
            }
        }
    }
}
