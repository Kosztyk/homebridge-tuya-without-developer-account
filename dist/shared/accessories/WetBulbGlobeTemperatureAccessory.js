"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const TemperatureHumiditySensorAccessory_1 = __importDefault(require("./TemperatureHumiditySensorAccessory"));
const CurrentWetBulbGlobeTemperature_1 = require("./characteristic/CurrentWetBulbGlobeTemperature");
const SCHEMA_CODE = {
    CURRENT_TEMP: ['va_temperature', 'temp_value'],
    CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
};
class WetBulbGlobeTemperatureAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CURRENT_TEMP, SCHEMA_CODE.CURRENT_HUMIDITY];
    }
    configureServices() {
        const helperAcessory = new TemperatureHumiditySensorAccessory_1.default(this.platform, this.accessory);
        (0, CurrentWetBulbGlobeTemperature_1.configureCurrentWetBulbGlobeTemperature)(helperAcessory);
    }
}
exports.default = WetBulbGlobeTemperatureAccessory;
//# sourceMappingURL=WetBulbGlobeTemperatureAccessory.js.map