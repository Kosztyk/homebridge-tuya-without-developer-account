"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
const SwingMode_1 = require("./characteristic/SwingMode");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const RelativeHumidityDehumidifierThreshold_1 = require("./characteristic/RelativeHumidityDehumidifierThreshold");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    CURRENT_HUMIDITY: ['humidity_indoor'],
    TARGET_HUMIDITY: ['dehumidify_set_value'],
    CURRENT_TEMP: ['temp_indoor'],
    SPEED_LEVEL: ['fan_speed_enum'],
    SWING: ['swing'],
    LOCK: ['child_lock'],
};
class DehumidifierAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE, SCHEMA_CODE.CURRENT_HUMIDITY];
    }
    configureServices() {
        // Required Characteristics
        (0, Active_1.configureActive)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
        this.configureCurrentState();
        this.configureTargetState();
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
        // Optional Characteristics
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.LOCK));
        (0, RelativeHumidityDehumidifierThreshold_1.configureRelativeHumidityDehumidifierThreshold)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TARGET_HUMIDITY));
        (0, RotationSpeed_1.configureRotationSpeedLevel)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.SPEED_LEVEL));
        (0, SwingMode_1.configureSwingMode)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.SWING));
        // Other
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
    }
    mainService() {
        return this.accessory.getService(this.Service.HumidifierDehumidifier)
            || this.accessory.addService(this.Service.HumidifierDehumidifier);
    }
    configureCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        if (!schema) {
            this.log.warn('CurrentHumidifierDehumidifierState not supported.');
            return;
        }
        const { INACTIVE, DEHUMIDIFYING } = this.Characteristic.CurrentHumidifierDehumidifierState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status?.value ? DEHUMIDIFYING : INACTIVE;
        });
    }
    configureTargetState() {
        const { DEHUMIDIFIER } = this.Characteristic.TargetHumidifierDehumidifierState;
        const validValues = [DEHUMIDIFIER];
        this.mainService().getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
            .onGet(() => {
            return DEHUMIDIFIER;
        }).setProps({ validValues });
    }
}
exports.default = DehumidifierAccessory;
//# sourceMappingURL=DehumidifierAccessory.js.map