"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    CO_STATUS: ['co_status', 'co_state'],
    CO_LEVEL: ['co_value'],
};
class CarbonMonoxideSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CO_STATUS];
    }
    configureServices() {
        this.configureCarbonMonoxideDetected();
        this.configureCarbonMonoxideLevel();
    }
    mainService() {
        return this.accessory.getService(this.Service.CarbonMonoxideSensor)
            || this.accessory.addService(this.Service.CarbonMonoxideSensor);
    }
    configureCarbonMonoxideDetected() {
        const schema = this.getSchema(...SCHEMA_CODE.CO_STATUS);
        if (!schema) {
            return;
        }
        const { CO_LEVELS_ABNORMAL, CO_LEVELS_NORMAL } = this.Characteristic.CarbonMonoxideDetected;
        this.mainService().getCharacteristic(this.Characteristic.CarbonMonoxideDetected)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (status.value === 'alarm' || status.value === '1') ? CO_LEVELS_ABNORMAL : CO_LEVELS_NORMAL;
        });
    }
    configureCarbonMonoxideLevel() {
        const schema = this.getSchema(...SCHEMA_CODE.CO_LEVEL);
        if (!schema) {
            return;
        }
        const property = schema.property;
        const multiple = Math.pow(10, property ? property.scale : 0);
        this.mainService().getCharacteristic(this.Characteristic.CarbonMonoxideLevel)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            const value = (0, util_1.limit)(status.value / multiple, 0, 100);
            return value;
        });
    }
}
exports.default = CarbonMonoxideSensorAccessory;
//# sourceMappingURL=CarbonMonoxideSensorAccessory.js.map