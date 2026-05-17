"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    SENSOR_STATUS: ['smoke_sensor_status', 'smoke_sensor_state'],
};
class SmokeSensor extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.SENSOR_STATUS];
    }
    configureServices() {
        const schema = this.getSchema(...SCHEMA_CODE.SENSOR_STATUS);
        if (!schema) {
            return;
        }
        const { SMOKE_NOT_DETECTED, SMOKE_DETECTED } = this.Characteristic.SmokeDetected;
        const service = this.accessory.getService(this.Service.SmokeSensor)
            || this.accessory.addService(this.Service.SmokeSensor);
        service.getCharacteristic(this.Characteristic.SmokeDetected)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            if ((status.value === 'alarm' || status.value === '1')) {
                return SMOKE_DETECTED;
            }
            else {
                return SMOKE_NOT_DETECTED;
            }
        });
    }
}
exports.default = SmokeSensor;
//# sourceMappingURL=SmokeSensorAccessory.js.map