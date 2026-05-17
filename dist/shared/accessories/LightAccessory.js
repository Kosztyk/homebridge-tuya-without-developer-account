"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const On_1 = require("./characteristic/On");
const MotionDetected_1 = require("./characteristic/MotionDetected");
const Light_1 = require("./characteristic/Light");
const SCHEMA_CODE = {
    ON: ['switch_led'],
    BRIGHTNESS: ['bright_value', 'bright_value_v2'],
    COLOR_TEMP: ['temp_value', 'temp_value_v2'],
    COLOR: ['colour_data', 'colour_data_v2'],
    WORK_MODE: ['work_mode'],
    PIR: ['pir_state'],
    PIR_ON: ['switch_pir'],
    POWER_SWITCH: ['switch'],
};
class LightAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ON];
    }
    configureServices() {
        const service = this.accessory.getService(this.Service.Lightbulb)
            || this.accessory.addService(this.Service.Lightbulb);
        (0, Light_1.configureLight)(this, service, this.getSchema(...SCHEMA_CODE.ON), this.getSchema(...SCHEMA_CODE.BRIGHTNESS), this.getSchema(...SCHEMA_CODE.COLOR_TEMP), this.getSchema(...SCHEMA_CODE.COLOR), this.getSchema(...SCHEMA_CODE.WORK_MODE));
        // PIR
        (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.PIR_ON));
        (0, MotionDetected_1.configureMotionDetected)(this, undefined, this.getSchema(...SCHEMA_CODE.PIR));
        // RGB Power Switch
        (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.POWER_SWITCH));
    }
}
exports.default = LightAccessory;
//# sourceMappingURL=LightAccessory.js.map