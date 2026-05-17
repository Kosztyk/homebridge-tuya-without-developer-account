"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = [
    {
        NAME: 'control',
        CURRENT_POSITION: ['percent_state'],
        TARGET_POSITION_CONTROL: ['control', 'mach_operate'],
        TARGET_POSITION_PERCENT: ['percent_control', 'position'],
    },
    {
        NAME: 'control_2',
        CURRENT_POSITION: ['percent_state'],
        TARGET_POSITION_CONTROL: ['control_2', 'mach_operate'],
        TARGET_POSITION_PERCENT: ['percent_control_2', 'position'],
    },
];
class WindowCoveringAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE[0].TARGET_POSITION_CONTROL]; //, SCHEMA_CODE[1].TARGET_POSITION_CONTROL];
    }
    configureServices() {
        let amount = 1;
        const schema = this.getSchema('control_2');
        if (schema) {
            amount = 2;
        }
        this.log.warn('Curtain amount:', amount);
        for (let i = 0; i < amount; i++) {
            this.configureCurrentPosition(i);
            this.configurePositionState(i);
            if (this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT)) {
                this.configureTargetPositionPercent(i);
            }
            else {
                this.configureTargetPositionControl(i);
            }
        }
    }
    configureCurrentPosition(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const targetControlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.CurrentPosition)
            .onGet(() => {
            if (currentSchema) {
                const status = this.getStatus(currentSchema.code);
                return (0, util_1.limit)(status.value, 0, 100);
            }
            else if (targetSchema) {
                const status = this.getStatus(targetSchema.code);
                return (0, util_1.limit)(status.value, 0, 100);
            }
            const status = this.getStatus(targetControlSchema.code);
            if (status.value === 'close' || status.value === 'FZ') {
                return 0;
            }
            else if (status.value === 'stop' || status.value === 'STOP') {
                return 50;
            }
            else if (status.value === 'open' || status.value === 'ZZ') {
                return 100;
            }
            this.log.warn('Unknown CurrentPosition:', status.value);
            return 50;
        });
    }
    configurePositionState(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const { DECREASING, INCREASING, STOPPED } = this.Characteristic.PositionState;
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => {
            if (!currentSchema || !targetSchema) {
                return STOPPED;
            }
            const currentStatus = this.getStatus(currentSchema.code);
            const targetStatus = this.getStatus(targetSchema.code);
            if (targetStatus.value === 100 && currentStatus.value !== 100) {
                return INCREASING;
            }
            else if (targetStatus.value === 0 && currentStatus.value !== 0) {
                return DECREASING;
            }
            else {
                return STOPPED;
            }
        });
    }
    configureTargetPositionPercent(i) {
        const schema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        if (!schema) {
            return;
        }
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (0, util_1.limit)(status.value, 0, 100);
        })
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: value }], true);
        });
    }
    configureTargetPositionControl(i) {
        const schema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        if (!schema) {
            return;
        }
        const isOldSchema = !schema.property.range.includes('open');
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            if (status.value === 'close' || status.value === 'FZ') {
                return 0;
            }
            else if (status.value === 'stop' || status.value === 'STOP') {
                return 50;
            }
            else if (status.value === 'open' || status.value === 'ZZ') {
                return 100;
            }
            this.log.warn('Unknown TargetPosition:', status.value);
            return 50;
        })
            .onSet(async (value) => {
            let control;
            if (value === 0) {
                control = isOldSchema ? 'FZ' : 'close';
            }
            else if (value === 100) {
                control = isOldSchema ? 'ZZ' : 'open';
            }
            else {
                control = isOldSchema ? 'STOP' : 'stop';
            }
            await this.sendCommands([{ code: schema.code, value: control }], true);
        })
            .setProps({
            minStep: 50,
        });
    }
}
exports.default = WindowCoveringAccessory;
//# sourceMappingURL=WindowCoveringAccessory.js.map