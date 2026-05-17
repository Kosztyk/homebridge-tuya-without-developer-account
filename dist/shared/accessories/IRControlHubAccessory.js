"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
// import { configureCurrentAbsoluteHumidity } from './characteristic/CurrentAbsoluteHumidity';
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const LightSensor_1 = require("./characteristic/LightSensor");
const SCHEMA_CODE = {
    CURRENT_TEMP: ['va_temperature', 'temp_value'],
    CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
    LIGHT_SENSOR: ['bright_value'],
};
class IRControlHubAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [];
    }
    configureServices() {
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
        (0, LightSensor_1.configureLightSensor)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_SENSOR));
        // eslint-disable-next-line max-len
        //    configureCurrentAbsoluteHumidity(this.platform.api, this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY), this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        const key = `wbgt-${this.device.id}`;
        const uuid = this.platform.api.hap.uuid.generate(key);
        if (!this.deviceManager.devices.some(device => device.uuid === uuid)) {
            this.log.info(`add wbgt device:${key}`);
            const virtualDevice = this.deviceManager.createVirtualDevice(this.device, uuid);
            virtualDevice.product_id = 'virtual-product-id-wbgt';
            virtualDevice.category = 'wsdcg';
            virtualDevice.name = 'WBGT';
            this.deviceManager.devices.push(virtualDevice);
        }
    }
    getSubAccessories() {
        return this.platform.accessoryHandlers.filter(accessory => accessory.device.parent_id === this.device.id);
    }
    async onDeviceStatusUpdate(status) {
        super.onDeviceStatusUpdate(status);
        // Trigger sub device update temperature & humidity from parent device.
        for (const subAccessory of this.getSubAccessories()) {
            await subAccessory.updateAllValues();
        }
    }
}
exports.default = IRControlHubAccessory;
//# sourceMappingURL=IRControlHubAccessory.js.map