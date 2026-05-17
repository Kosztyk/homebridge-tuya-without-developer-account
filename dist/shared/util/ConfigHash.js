"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigHash = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Generic config hash manager for detecting configuration changes between restarts.
 * Used by both local and cloud device managers to track device config modifications.
 */
class ConfigHash {
    constructor(persistPath, subdirectory = 'tuya-configs') {
        this.hashDir = path_1.default.join(persistPath, subdirectory);
        // Ensure directory exists
        if (!fs_1.default.existsSync(this.hashDir)) {
            fs_1.default.mkdirSync(this.hashDir, { recursive: true });
        }
    }
    /**
     * Compute a hash of any configuration object.
     * Converts object to sorted JSON string and returns SHA256 hash.
     */
    computeHash(configObject) {
        const json = JSON.stringify(configObject, Object.keys(configObject).sort());
        return crypto_1.default.createHash('sha256').update(json).digest('hex').slice(0, 16);
    }
    /**
     * Get the stored hash for an item, if any.
     */
    getStoredHash(itemId) {
        try {
            const hashFile = path_1.default.join(this.hashDir, `${itemId}.hash`);
            if (fs_1.default.existsSync(hashFile)) {
                return fs_1.default.readFileSync(hashFile, 'utf-8').trim();
            }
        }
        catch {
            // Silently fail if hash file can't be read
        }
        return null;
    }
    /**
     * Save the hash for an item.
     */
    saveHash(itemId, hash) {
        try {
            const hashFile = path_1.default.join(this.hashDir, `${itemId}.hash`);
            fs_1.default.writeFileSync(hashFile, hash, 'utf-8');
        }
        catch {
            // Silently fail if hash can't be saved
        }
    }
    /**
     * Check if configuration has changed since last run.
     * Returns { changed: boolean, newHash: string }
     */
    hasConfigChanged(itemId, configObject) {
        const newHash = this.computeHash(configObject);
        const oldHash = this.getStoredHash(itemId);
        // If no old hash, it's a new item (not a change in existing config)
        if (!oldHash) {
            this.saveHash(itemId, newHash);
            return { changed: false, newHash };
        }
        // If hashes differ, config changed
        if (oldHash !== newHash) {
            this.saveHash(itemId, newHash);
            return { changed: true, newHash };
        }
        // Hash matches, no change
        return { changed: false, newHash };
    }
}
exports.ConfigHash = ConfigHash;
//# sourceMappingURL=ConfigHash.js.map