"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    CO2_STATUS: ['co2_state'],
    CO2_LEVEL: ['co2_value'],
};
class CarbonDioxideSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CO2_STATUS];
    }
    configureServices() {
        this.configureCarbonDioxideDetected();
        this.configureCarbonDioxideLevel();
    }
    mainService() {
        return this.accessory.getService(this.Service.CarbonDioxideSensor)
            || this.accessory.addService(this.Service.CarbonDioxideSensor);
    }
    configureCarbonDioxideDetected() {
        const schema = this.getSchema(...SCHEMA_CODE.CO2_STATUS);
        if (!schema) {
            return;
        }
        const { CO2_LEVELS_ABNORMAL, CO2_LEVELS_NORMAL } = this.Characteristic.CarbonDioxideDetected;
        this.mainService().getCharacteristic(this.Characteristic.CarbonDioxideDetected)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (status.value === 'alarm') ? CO2_LEVELS_ABNORMAL : CO2_LEVELS_NORMAL;
        });
    }
    configureCarbonDioxideLevel() {
        const schema = this.getSchema(...SCHEMA_CODE.CO2_LEVEL);
        if (!schema) {
            return;
        }
        const property = schema.property;
        const multiple = Math.pow(10, property ? property.scale : 0);
        this.mainService().getCharacteristic(this.Characteristic.CarbonDioxideLevel)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            const value = (0, util_1.limit)(status.value / multiple, 0, 100000);
            return value;
        });
    }
}
exports.default = CarbonDioxideSensorAccessory;
//# sourceMappingURL=CarbonDioxideSensorAccessory.js.map