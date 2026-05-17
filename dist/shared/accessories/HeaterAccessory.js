"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const SwingMode_1 = require("./characteristic/SwingMode");
const TemperatureDisplayUnits_1 = require("./characteristic/TemperatureDisplayUnits");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    WORK_STATE: ['work_state', 'mode'],
    CURRENT_TEMP: ['temp_current'],
    TARGET_TEMP: ['temp_set'],
    LOCK: ['lock'],
    SWING: ['shake'],
    TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
};
const STATE_CODE = {
    HEATING: ['heating', 'High'],
    IDLE: ['warming', 'Low'],
};
class HeaterAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE];
    }
    configureServices() {
        (0, Active_1.configureActive)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
        this.configureCurrentState();
        this.configureTargetState();
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.LOCK));
        (0, SwingMode_1.configureSwingMode)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.SWING));
        this.configureHeatingThresholdTemp();
        (0, TemperatureDisplayUnits_1.configureTempDisplayUnits)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
    }
    mainService() {
        return this.accessory.getService(this.Service.HeaterCooler)
            || this.accessory.addService(this.Service.HeaterCooler);
    }
    configureCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.WORK_STATE);
        const { ACTIVE: ON, INACTIVE: OFF } = this.Characteristic.Active;
        const { INACTIVE, IDLE, HEATING } = this.Characteristic.CurrentHeaterCoolerState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
            .onGet(() => {
            if (!schema) {
                return INACTIVE;
            }
            if (this.mainService().getCharacteristic(this.Characteristic.Active).value === OFF) {
                return INACTIVE;
            }
            const status = this.getStatus(schema.code);
            if (STATE_CODE.HEATING.includes(status.value)) {
                return HEATING;
            }
            else if (STATE_CODE.IDLE.includes(status.value)) {
                return IDLE;
            }
            return INACTIVE;
        });
    }
    configureTargetState() {
        const { AUTO, HEAT, COOL } = this.Characteristic.TargetHeaterCoolerState;
        const validValues = [HEAT];
        this.mainService().getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
            .onGet(() => {
            // Since setting the mode to AUTO prevents temperature adjustments in the iPhone Home app, the default mode will be set to HEAT.
            return HEAT;
        })
            .onSet(async (value) => {
            // TODO
            this.log.debug('configureTargetState set:' + value);
        })
            .setProps({ validValues });
    }
    configureHeatingThresholdTemp() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
        if (!schema) {
            return;
        }
        const property = schema.property;
        const props = (0, util_1.toHapProperty)(property);
        const multiple = Math.pow(10, property['scale'] || 0);
        this.log.debug('Set props for HeatingThresholdTemperature:', props);
        this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            const temp = status.value / multiple;
            return (0, util_1.limit)(temp, props['minValue'], props['maxValue']);
        })
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: value * multiple }]);
        })
            .setProps(props);
    }
}
exports.default = HeaterAccessory;
//# sourceMappingURL=HeaterAccessory.js.map