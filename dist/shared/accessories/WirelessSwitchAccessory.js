"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const ProgrammableSwitchEvent_1 = require("./characteristic/ProgrammableSwitchEvent");
const SCHEMA_CODE = {
    ON: ['switch_mode1', 'switch1_value'],
};
class SwitchAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ON];
    }
    configureServices() {
        const schema = this.device.schema.filter(schema => schema.code.match(/switch_mode(\d+)/) || schema.code.match(/switch(\d+)_value/));
        for (const _schema of schema) {
            const name = (schema.length === 1) ? this.device.name : _schema.code;
            this.configureSwitch(_schema, name);
        }
    }
    configureSwitch(schema, name) {
        const service = this.accessory.getService(schema.code)
            || this.accessory.addService(this.Service.StatelessProgrammableSwitch, name, schema.code);
        const group = schema.code.match(/switch_mode(\d+)/) || schema.code.match(/switch(\d+)_value/);
        const index = group[1];
        service.setCharacteristic(this.Characteristic.ServiceLabelIndex, index);
        (0, ProgrammableSwitchEvent_1.configureProgrammableSwitchEvent)(this, service, schema);
    }
    async onDeviceStatusUpdate(status) {
        super.onDeviceStatusUpdate(status);
        for (const _status of status) {
            const service = this.accessory.getService(_status.code);
            if (!service) {
                continue;
            }
            (0, ProgrammableSwitchEvent_1.onProgrammableSwitchEvent)(this, service, _status);
        }
    }
}
exports.default = SwitchAccessory;
//# sourceMappingURL=WirelessSwitchAccessory.js.map