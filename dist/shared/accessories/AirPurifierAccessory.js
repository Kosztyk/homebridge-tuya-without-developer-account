"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TuyaDevice_1 = require("../../cloud/device/TuyaDevice");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const AirQuality_1 = require("./characteristic/AirQuality");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    MODE: ['mode'],
    LOCK: ['lock'],
    SPEED: ['speed'],
    SPEED_LEVEL: ['fan_speed_enum', 'speed'],
    AIR_QUALITY: ['air_quality', 'pm25'],
    PM2_5: ['pm25'],
    VOC: ['tvoc'],
};
class AirPurifierAccessory extends BaseAccessory_1.default {
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
        // Other
        (0, AirQuality_1.configureAirQuality)(this, undefined, this.getSchema(...SCHEMA_CODE.AIR_QUALITY), this.getSchema(...SCHEMA_CODE.PM2_5), undefined, this.getSchema(...SCHEMA_CODE.VOC));
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
}
exports.default = AirPurifierAccessory;
//# sourceMappingURL=AirPurifierAccessory.js.map