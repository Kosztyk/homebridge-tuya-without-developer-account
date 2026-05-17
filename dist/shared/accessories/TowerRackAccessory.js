"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const TargetTemperature_1 = require("./characteristic/TargetTemperature");
const TemperatureDisplayUnits_1 = require("./characteristic/TemperatureDisplayUnits");
const SCHEMA_CODE = {
    ON: ['switch'],
    TARGET_TEMP: ['temp_set'],
    TARGET_MODE: ['mode'],
    TEMP_UNIT_CONVERT: ['temp_unit_convert', 'c_f'],
    CURRENT_TEMP: ['temp_current', 'temp_set'],
    CURRENT_MODE: ['work_state', 'mode'],
};
class TowelRackAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CURRENT_TEMP, SCHEMA_CODE.TARGET_TEMP];
    }
    configureServices() {
        this.configureCurrentState();
        this.configureTargetState();
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, TargetTemperature_1.configureTargetTemperature)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TARGET_TEMP));
        (0, TemperatureDisplayUnits_1.configureTempDisplayUnits)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.TEMP_UNIT_CONVERT));
    }
    mainService() {
        return this.accessory.getService(this.Service.Thermostat)
            || this.accessory.addService(this.Service.Thermostat);
    }
    configureCurrentState() {
        const { OFF, HEAT, COOL } = this.Characteristic.CurrentHeatingCoolingState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
            .onGet(() => {
            const on = this.getStatus('switch');
            if (on && on.value === false) {
                return OFF;
            }
            const schema = this.getSchema(...SCHEMA_CODE.CURRENT_MODE);
            if (!schema) {
                // If don't support mode, compare current and target temp.
                const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_TEMP);
                const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_TEMP);
                if (!currentSchema || !targetSchema) {
                    return OFF;
                }
                const current = this.getStatus(currentSchema.code);
                const target = this.getStatus(targetSchema.code);
                if (target.value > current.value) {
                    return HEAT;
                }
                else if (target.value < current.value) {
                    return COOL;
                }
                else {
                    return OFF;
                }
            }
            const status = this.getStatus(schema.code);
            if (status.value === 'hot' || status.value === 'opened' || status.value === 'heating') {
                return HEAT;
            }
            else if (status.value === 'cold' ||
                status.value === 'eco' ||
                status.value === 'idle' ||
                status.value === 'window_opened') {
                return COOL;
            }
            // Don't know how to display unsupported work mode.
            return OFF;
        });
    }
    configureTargetState() {
        const { OFF, HEAT, COOL, AUTO } = this.Characteristic.TargetHeatingCoolingState;
        const validValues = [AUTO];
        // Thermostat valve may not support 'Power Off'
        if (this.getStatus('switch')) {
            validValues.push(OFF);
        }
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_MODE);
        const property = schema?.property;
        if (property) {
            if (property.range.includes('hot')) {
                validValues.push(HEAT);
            }
            if (property.range.includes('cold') || property.range.includes('eco')) {
                validValues.push(COOL);
            }
        }
        this.mainService().getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
            .onGet(() => {
            const on = this.getStatus('switch');
            if (on && on.value === false) {
                return OFF;
            }
            if (!schema) {
                // If don't support mode, display auto.
                return AUTO;
            }
            const status = this.getStatus(schema.code);
            if (status.value === 'hot') {
                return HEAT;
            }
            else if (status.value === 'cold' || status.value === 'eco') {
                return COOL;
            }
            else if (status.value === 'auto' || status.value === 'temp_auto') {
                return AUTO;
            }
            // Don't know how to display unsupported mode.
            return AUTO;
        })
            .onSet(async (value) => {
            const commands = [];
            // Thermostat valve may not support 'Power Off'
            const on = this.getStatus('switch');
            if (on) {
                if (value === OFF) {
                    commands.push({
                        code: 'switch',
                        value: false,
                    });
                }
                else if (on.value === false) {
                    commands.push({
                        code: 'switch',
                        value: true,
                    });
                }
            }
            if (schema) {
                if ((value === HEAT) && property.range.includes('hot')) {
                    commands.push({ code: schema.code, value: 'hot' });
                }
                else if (value === COOL) {
                    if (property.range.includes('eco')) {
                        commands.push({ code: schema.code, value: 'eco' });
                    }
                    else if (property.range.includes('cold')) {
                        commands.push({ code: schema.code, value: 'cold' });
                    }
                }
                else if ((value === AUTO) && property.range.includes('auto')) {
                    commands.push({ code: schema.code, value: 'auto' });
                }
            }
            if (commands.length !== 0) {
                await this.sendCommands(commands);
            }
        })
            .setProps({ validValues });
    }
}
exports.default = TowelRackAccessory;
//# sourceMappingURL=TowerRackAccessory.js.map