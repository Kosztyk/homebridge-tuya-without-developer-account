"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TuyaDevice_1 = require("../../cloud/device/TuyaDevice");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
const Light_1 = require("./characteristic/Light");
const On_1 = require("./characteristic/On");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    MODE: ['mode'],
    LOCK: ['lock'],
    SPEED: ['speed'],
    SPEED_LEVEL: ['fan_speed_enum', 'speed'],
    AIR_QUALITY: ['air_quality', 'pm25'],
    PM2_5: ['pm25'],
    VOC: ['tvoc'],
    LIGHT_ON: ['light', 'switch_led'],
    LIGHT_MODE: ['work_mode'],
    LIGHT_BRIGHT: ['bright_value', 'bright_value_v2'],
    LIGHT_TEMP: ['temp_value', 'temp_value_v2'],
    LIGHT_COLOR: ['colour_data'],
};
class ExtractionHoodAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE];
    }
    configureServices() {
        (0, Active_1.configureActive)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
        this.configureCurrentState();
        this.configureTargetState();
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.LOCK));
        if (this.getFanSpeedSchema()) {
            (0, RotationSpeed_1.configureRotationSpeed)(this, this.mainService(), this.getFanSpeedSchema());
        }
        else if (this.getFanSpeedLevelSchema()) {
            (0, RotationSpeed_1.configureRotationSpeedLevel)(this, this.mainService(), this.getFanSpeedLevelSchema());
        }
        // Light
        if (this.getSchema(...SCHEMA_CODE.LIGHT_ON)) {
            if (this.lightServiceType() === this.Service.Lightbulb) {
                (0, Light_1.configureLight)(this, this.lightService(), this.getSchema(...SCHEMA_CODE.LIGHT_ON), this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), this.getSchema(...SCHEMA_CODE.LIGHT_TEMP), this.getSchema(...SCHEMA_CODE.LIGHT_COLOR), this.getSchema(...SCHEMA_CODE.LIGHT_MODE));
            }
            else if (this.lightServiceType() === this.Service.Switch) {
                (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_ON));
                const unusedService = this.accessory.getService(this.Service.Lightbulb);
                if (unusedService) {
                    this.accessory.removeService(unusedService);
                }
            }
        }
    }
    mainService() {
        return this.accessory.getService(this.Service.AirPurifier)
            || this.accessory.addService(this.Service.AirPurifier);
    }
    getFanSpeedSchema() {
        const schema = this.getSchema(...SCHEMA_CODE.SPEED);
        if (schema && schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Integer) {
            return schema;
        }
        return undefined;
    }
    getFanSpeedLevelSchema() {
        const schema = this.getSchema(...SCHEMA_CODE.SPEED_LEVEL);
        if (schema && schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Enum) {
            return schema;
        }
        return undefined;
    }
    configureCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        if (!schema) {
            return;
        }
        const { INACTIVE, PURIFYING_AIR } = this.Characteristic.CurrentAirPurifierState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentAirPurifierState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value ? PURIFYING_AIR : INACTIVE;
        });
    }
    configureTargetState() {
        const schema = this.getSchema(...SCHEMA_CODE.MODE);
        if (!schema) {
            return;
        }
        const { MANUAL, AUTO } = this.Characteristic.TargetAirPurifierState;
        this.mainService().getCharacteristic(this.Characteristic.TargetAirPurifierState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (status.value === 'auto') ? AUTO : MANUAL;
        })
            .onSet(async (value) => {
            await this.sendCommands([{
                    code: schema.code,
                    value: (value === AUTO) ? 'auto' : 'manual',
                }], true);
        });
    }
    lightServiceType() {
        if (this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT)
            || this.getSchema(...SCHEMA_CODE.LIGHT_TEMP)
            || this.getSchema(...SCHEMA_CODE.LIGHT_COLOR)
            || this.getSchema(...SCHEMA_CODE.LIGHT_MODE)) {
            return this.Service.Lightbulb;
        }
        return this.Service.Switch;
    }
    lightService() {
        return this.accessory.getService(this.Service.Lightbulb)
            || this.accessory.addService(this.Service.Lightbulb);
    }
}
exports.default = ExtractionHoodAccessory;
//# sourceMappingURL=ExtractionHoodAccessory.js.map