"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
class TemperatureHumiditySensorAccessory extends BaseAccessory_1.default {
    configureServices() {
        const { temperatureSchemas, humiditySchemas } = this.getDynamicSchemaCodes();
        temperatureSchemas.forEach((schema, index) => {
            const serviceName = `Temperature Sensor ${index + 1}`;
            const serviceSubtype = `temperature_sensor_${index + 1}`;
            const service = this.accessory.getServiceById(this.Service.TemperatureSensor, serviceSubtype) ||
                this.accessory.addService(this.Service.TemperatureSensor, serviceName, serviceSubtype);
            service
                .getCharacteristic(this.Characteristic.CurrentTemperature)
                .onGet(() => {
                const status = this.getStatus(schema.code);
                if (status) {
                    const property = this.getSchema(schema.code)?.property;
                    const multiple = Math.pow(10, property.scale || 0);
                    return Math.min(Math.max(status.value / multiple, -100), 100);
                }
                return 0; // Default value if no status is found
            });
        });
        humiditySchemas.forEach((schema, index) => {
            const serviceName = `Humidity Sensor ${index + 1}`;
            const serviceSubtype = `humidity_sensor_${index + 1}`;
            const service = this.accessory.getServiceById(this.Service.HumiditySensor, serviceSubtype) ||
                this.accessory.addService(this.Service.HumiditySensor, serviceName, serviceSubtype);
            service
                .getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
                .onGet(() => {
                const status = this.getStatus(schema.code);
                if (status) {
                    return status.value;
                }
                return 0; // Default value if no status is found
            });
        });
    }
    getDynamicSchemaCodes() {
        const temperatureSchemas = [];
        const humiditySchemas = [];
        this.device.schema.forEach((schema) => {
            if (schema.code.includes('ToutCh')) {
                temperatureSchemas.push(schema);
            }
            else if (schema.code.includes('HoutCh')) {
                humiditySchemas.push(schema);
            }
        });
        return { temperatureSchemas, humiditySchemas };
    }
}
exports.default = TemperatureHumiditySensorAccessory;
//# sourceMappingURL=WeatherStationAccessory.js.map