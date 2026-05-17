"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const Light_1 = require("./characteristic/Light");
const On_1 = require("./characteristic/On");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
const SCHEMA_CODE = {
    ON: ['switch'],
    SPRAY_ON: ['switch_spray'],
    SPRAY_MODE: ['mode'],
    SPRAY_LEVEL: ['level'],
    LIGHT_ON: ['switch_led'],
    LIGHT_MODE: ['work_mode'],
    LIGHT_BRIGHT: ['bright_value', 'bright_value_v2'],
    LIGHT_COLOR: ['colour_data', 'colour_data_hsv'],
    SOUND_ON: ['switch_sound'],
};
class DiffuserAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.SPRAY_ON];
    }
    configureServices() {
        // Main Switch
        (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.ON));
        this.configureDiffuser();
        (0, Light_1.configureLight)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_ON), this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), undefined, this.getSchema(...SCHEMA_CODE.LIGHT_COLOR), this.getSchema(...SCHEMA_CODE.LIGHT_MODE));
        (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.SOUND_ON)); // Sound Switch
    }
    mainService() {
        return this.accessory.getService(this.Service.AirPurifier)
            || this.accessory.addService(this.Service.AirPurifier);
    }
    configureDiffuser() {
        const sprayOnSchema = this.getSchema(...SCHEMA_CODE.SPRAY_ON);
        // Required Characteristics
        (0, Active_1.configureActive)(this, this.mainService(), sprayOnSchema);
        const { INACTIVE, PURIFYING_AIR } = this.Characteristic.CurrentAirPurifierState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentAirPurifierState)
            .onGet(() => {
            const status = this.getStatus(sprayOnSchema.code);
            return status.value ? PURIFYING_AIR : INACTIVE;
        });
        // const { MANUAL } = this.Characteristic.TargetAirPurifierState;
        // this.mainService().getCharacteristic(this.Characteristic.TargetAirPurifierState)
        //   .setProps({ validValues: [MANUAL] });
        // Optional Characteristics
        (0, RotationSpeed_1.configureRotationSpeedLevel)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.SPRAY_LEVEL));
    }
}
exports.default = DiffuserAccessory;
//# sourceMappingURL=DiffuserAccessory.js.map