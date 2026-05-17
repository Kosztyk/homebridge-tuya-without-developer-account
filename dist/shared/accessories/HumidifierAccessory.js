"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const Light_1 = require("./characteristic/Light");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    CURRENT_HUMIDITY: ['humidity_current'],
    TARGET_HUMIDITY: ['humidity_set'],
    CURRENT_TEMP: ['temp_current'],
    LIGHT_ON: ['switch_led'],
    LIGHT_MODE: ['work_mode'],
    LIGHT_BRIGHT: ['bright_value', 'bright_value_v2'],
    LIGHT_COLOR: ['colour_data', 'colour_data_hsv'],
};
class HumidifierAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE];
    }
    configureServices() {
        // Required Characteristics
        (0, Active_1.configureActive)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
        this.configureCurrentState();
        this.configureTargetState();
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
        // Optional Characteristics
        this.configureRelativeHumidityHumidifierThreshold();
        this.configureRotationSpeed();
        // Other
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, Light_1.configureLight)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_ON), this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), undefined, this.getSchema(...SCHEMA_CODE.LIGHT_COLOR), this.getSchema(...SCHEMA_CODE.LIGHT_MODE));
    }
    mainService() {
        return this.accessory.getService(this.Service.HumidifierDehumidifier)
            || this.accessory.addService(this.Service.HumidifierDehumidifier);
    }
    configureTargetState() {
        const { HUMIDIFIER } = this.Characteristic.TargetHumidifierDehumidifierState;
        const validValues = [HUMIDIFIER];
        this.mainService().getCharacteristic(this.Characteristic.TargetHumidifierDehumidifierState)
            .onGet(() => {
            return HUMIDIFIER;
        }).setProps({ validValues });
    }
    configureCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.ACTIVE);
        if (!schema) {
            this.log.warn('CurrentHumidifierDehumidifierState not supported.');
            return;
        }
        const { INACTIVE, HUMIDIFYING } = this.Characteristic.CurrentHumidifierDehumidifierState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHumidifierDehumidifierState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status?.value ? HUMIDIFYING : INACTIVE;
        });
    }
    configureRelativeHumidityHumidifierThreshold() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_HUMIDITY);
        if (!schema) {
            this.log.warn('Humidity setting is not supported.');
            return;
        }
        const property = schema.property;
        const multiple = Math.pow(10, property ? property.scale : 0);
        const props = {
            minValue: 0,
            maxValue: 100,
            minStep: Math.max(1, property.step / multiple),
        };
        this.log.debug('Set props for RelativeHumidityHumidifierThreshold:', props);
        this.mainService().getCharacteristic(this.Characteristic.RelativeHumidityHumidifierThreshold)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (0, util_1.limit)(status.value / multiple, 0, 100);
        })
            .onSet(async (value) => {
            const humidity_set = (0, util_1.limit)(value * multiple, property.min, property.max);
            await this.sendCommands([{ code: schema.code, value: humidity_set }]);
            // also set spray mode to humidity
            await this.setSprayModeToHumidity();
        }).setProps(props);
    }
    configureRotationSpeed() {
        const schema = this.getSchema('mode');
        if (!schema) {
            this.log.warn('Mode setting is not supported.');
            return;
        }
        const unusedService = this.accessory.getService(this.Service.Fan);
        if (unusedService) {
            this.accessory.removeService(unusedService);
        }
        this.mainService().getCharacteristic(this.Characteristic.RotationSpeed)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            let v = 3;
            switch (status.value) {
                case 'small':
                    v = 1;
                    break;
                case 'middle':
                    v = 2;
                    break;
            }
            return (0, util_1.remap)(v, 0, 3, 0, 100);
        }).onSet(async (value) => {
            value = Math.round((0, util_1.remap)(value, 0, 100, 0, 3));
            let mode = 'small';
            switch (value) {
                case 2:
                    mode = 'middle';
                    break;
                case 3:
                    mode = 'large';
                    break;
            }
            await this.sendCommands([{ code: schema.code, value: mode }]);
        });
    }
    async setSprayModeToHumidity() {
        const schema = this.getSchema('spray_mode');
        if (!schema) {
            this.log.debug('Spray mode not supported.');
            return;
        }
        await this.sendCommands([{ code: schema.code, value: 'humidity' }]);
    }
}
exports.default = HumidifierAccessory;
//# sourceMappingURL=HumidifierAccessory.js.map