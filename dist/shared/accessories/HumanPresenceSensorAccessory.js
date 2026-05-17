"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const OccupancyDetected_1 = require("./characteristic/OccupancyDetected");
const SCHEMA_CODE = {
    PRESENCE: ['presence_state'],
};
class HumanPresenceSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.PRESENCE];
    }
    configureServices() {
        (0, OccupancyDetected_1.configureOccupancyDetected)(this, undefined, this.getSchema(...SCHEMA_CODE.PRESENCE));
    }
}
exports.default = HumanPresenceSensorAccessory;
//# sourceMappingURL=HumanPresenceSensorAccessory.js.map