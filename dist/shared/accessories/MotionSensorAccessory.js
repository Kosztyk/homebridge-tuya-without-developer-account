"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const MotionDetected_1 = require("./characteristic/MotionDetected");
const SCHEMA_CODE = {
    PIR: ['pir'],
};
class MotionSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.PIR];
    }
    configureServices() {
        (0, MotionDetected_1.configureMotionDetected)(this, undefined, this.getSchema(...SCHEMA_CODE.PIR));
    }
}
exports.default = MotionSensorAccessory;
//# sourceMappingURL=MotionSensorAccessory.js.map