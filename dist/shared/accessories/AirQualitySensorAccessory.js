"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const AirQuality_1 = require("./characteristic/AirQuality");
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const SCHEMA_CODE = {
    AIR_QUALITY: ['pm25_value'],
    PM2_5: ['pm25_value'],
    PM10: ['pm10_value', 'pm10'],
    VOC: ['voc_value'],
    CURRENT_TEMP: ['va_temperature', 'temp_indoor', 'temp_current'],
    CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
};
class AirQualitySensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.AIR_QUALITY];
    }
    configureServices() {
        (0, AirQuality_1.configureAirQuality)(this, undefined, this.getSchema(...SCHEMA_CODE.AIR_QUALITY), this.getSchema(...SCHEMA_CODE.PM2_5), this.getSchema(...SCHEMA_CODE.PM10), this.getSchema(...SCHEMA_CODE.VOC));
        // Other
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
    }
}
exports.default = AirQualitySensorAccessory;
//# sourceMappingURL=AirQualitySensorAccessory.js.map