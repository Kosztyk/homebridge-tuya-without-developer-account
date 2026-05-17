"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    BRIGHT_LEVEL: ['bright_value'],
};
class LightSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.BRIGHT_LEVEL];
    }
    configureServices() {
        const schema = this.getSchema(...SCHEMA_CODE.BRIGHT_LEVEL);
        if (!schema) {
            return;
        }
        const service = this.accessory.getService(this.Service.LightSensor)
            || this.accessory.addService(this.Service.LightSensor);
        const property = schema.property;
        const multiple = Math.pow(10, property ? property.scale : 0);
        service.getCharacteristic(this.Characteristic.CurrentAmbientLightLevel)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (0, util_1.limit)(status.value / multiple, 0.0001, 100000);
        });
    }
}
exports.default = LightSensorAccessory;
//# sourceMappingURL=LightSensorAccessory.js.map