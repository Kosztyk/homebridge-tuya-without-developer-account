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
    WORK_STATE: ['work_state'],
    CURRENT_TEMP: ['temp_current'],
    TARGET_TEMP: ['temp_set'],
    LOCK: ['lock'],
    SWING: ['shake'],
    TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
};
class HeaterAccessory_old extends BaseAccessory_1.default {
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
        this.configureHeatingThreshouldTemp();
        (0, TemperatureDisplayUnits_1.configureTempDisplayUnits)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
    }
    mainService() {
        return this.accessory.getService(this.Service.HeaterCooler)
            || this.accessory.addService(this.Service.HeaterCooler);
    }
    configureCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.WORK_STATE);
        const { INACTIVE, IDLE, HEATING } = this.Characteristic.CurrentHeaterCoolerState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
            .onGet(() => {
            if (!schema) {
                return IDLE;
            }
            const status = this.getStatus(schema.code);
            if (status.value === 'heating') {
                return HEATING;
            }
            else if (status.value === 'warming') {
                return IDLE;
            }
            return INACTIVE;
        });
    }
    configureTargetState() {
        const { AUTO, HEAT, COOL } = this.Characteristic.TargetHeaterCoolerState;
        const validValues = [AUTO];
        this.mainService().getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
            .onGet(() => {
            return AUTO;
        })
            .onSet(async (value) => {
            // TODO
        })
            .setProps({ validValues });
    }
    configureHeatingThreshouldTemp() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
        if (!schema) {
            return;
        }
        const property = schema.property;
        const multiple = property ? Math.pow(10, property.scale) : 1;
        const props = {
            minValue: property.min / multiple,
            maxValue: property.max / multiple,
            minStep: Math.max(0.1, property.step / multiple),
        };
        this.log.debug('Set props for HeatingThresholdTemperature:', props);
        this.mainService().getCharacteristic(this.Characteristic.HeatingThresholdTemperature)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            const temp = status.value / multiple;
            return (0, util_1.limit)(temp, props.minValue, props.maxValue);
        })
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: value * multiple }]);
        })
            .setProps(props);
    }
}
exports.default = HeaterAccessory_old;
//# sourceMappingURL=HeaterAccessory_old.js.map