"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    CONTACT_STATE: ['doorcontact_state', 'switch'],
};
class ContaceSensor extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CONTACT_STATE];
    }
    configureServices() {
        const schema = this.getSchema(...SCHEMA_CODE.CONTACT_STATE);
        if (!schema) {
            return;
        }
        const service = this.accessory.getService(this.Service.ContactSensor)
            || this.accessory.addService(this.Service.ContactSensor);
        const { CONTACT_NOT_DETECTED, CONTACT_DETECTED } = this.Characteristic.ContactSensorState;
        service.getCharacteristic(this.Characteristic.ContactSensorState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value ? CONTACT_NOT_DETECTED : CONTACT_DETECTED;
        });
    }
}
exports.default = ContaceSensor;
//# sourceMappingURL=ContactSensorAccessory.js.map