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
    getWindowCoveringOptions(i = 0) {
        const channelName = SCHEMA_CODE[i]?.NAME || 'control';
        const deviceConfig = this.device && typeof this.platform.getDeviceConfig === 'function'
            ? this.platform.getDeviceConfig(this.device)
            : undefined;
        const windowCovering = deviceConfig?.windowCovering;
        const channelConfig = windowCovering && typeof windowCovering === 'object' && windowCovering.channels && typeof windowCovering.channels === 'object'
            ? windowCovering.channels[channelName]
            : undefined;
        const firstBoolean = (...values) => {
            for (const value of values) {
                if (typeof value === 'boolean') {
                    return value;
                }
            }
            return false;
        };
        return {
            invertPosition: firstBoolean(channelConfig?.invertPosition, windowCovering?.invertPosition, deviceConfig?.invertPosition),
            reverseControl: firstBoolean(channelConfig?.reverseControl, windowCovering?.reverseControl, deviceConfig?.reverseControl, deviceConfig?.reverse),
        };
    }
    toLimitedPosition(value, fallback = 50) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }
        return (0, util_1.limit)(number, 0, 100);
    }
    rawPositionToHomeKit(value, i = 0) {
        const position = this.toLimitedPosition(value);
        return this.getWindowCoveringOptions(i).invertPosition ? 100 - position : position;
    }
    homeKitPositionToRaw(value, i = 0) {
        const position = this.toLimitedPosition(value);
        return this.getWindowCoveringOptions(i).invertPosition ? 100 - position : position;
    }
    getControlPosition(value, i = 0) {
        const lowerValue = String(value ?? '').toLowerCase();
        let position = 50;
        if (lowerValue === 'close' || lowerValue === 'fz') {
            position = 0;
        }
        else if (lowerValue === 'stop' || lowerValue === 'stopped') {
            position = this.targetPosition?.[i] ?? 50;
        }
        else if (lowerValue === 'open' || lowerValue === 'zz') {
            position = 100;
        }
        else {
            this.log.warn('Unknown WindowCovering position control value:', value);
        }
        if (this.getWindowCoveringOptions(i).reverseControl && position !== 50) {
            return 100 - position;
        }
        return position;
    }
    getControlCommand(value, i, isOldSchema) {
        const position = this.toLimitedPosition(value);
        const { reverseControl } = this.getWindowCoveringOptions(i);
        if (position === 0) {
            return reverseControl ? (isOldSchema ? 'ZZ' : 'open') : (isOldSchema ? 'FZ' : 'close');
        }
        else if (position === 100) {
            return reverseControl ? (isOldSchema ? 'FZ' : 'close') : (isOldSchema ? 'ZZ' : 'open');
        }
        return isOldSchema ? 'STOP' : 'stop';
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
                return this.rawPositionToHomeKit(status?.value, i);
            }
            else if (targetSchema) {
                const status = this.getStatus(targetSchema.code);
                return this.rawPositionToHomeKit(status?.value, i);
            }
            if (targetControlSchema) {
                const status = this.getStatus(targetControlSchema.code);
                return this.getControlPosition(status?.value, i);
            }
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
            const currentPosition = this.rawPositionToHomeKit(currentStatus?.value, i);
            const targetPosition = this.rawPositionToHomeKit(targetStatus?.value, i);
            if (targetPosition > currentPosition) {
                return INCREASING;
            }
            else if (targetPosition < currentPosition) {
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
            return this.rawPositionToHomeKit(status?.value, i);
        })
            .onSet(async (value) => {
            if (!this.targetPosition) {
                this.targetPosition = {};
            }
            this.targetPosition[i] = this.toLimitedPosition(value);
            await this.sendCommands([{ code: schema.code, value: this.homeKitPositionToRaw(value, i) }], true);
        });
    }
    configureTargetPositionControl(i) {
        const schema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        if (!schema) {
            return;
        }
        const range = Array.isArray(schema.property?.range) ? schema.property.range.map((item) => String(item).toLowerCase()) : [];
        const isOldSchema = range.length > 0 && !range.includes('open');
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return this.getControlPosition(status?.value, i);
        })
            .onSet(async (value) => {
            if (!this.targetPosition) {
                this.targetPosition = {};
            }
            this.targetPosition[i] = this.toLimitedPosition(value);
            const control = this.getControlCommand(value, i, isOldSchema);
            await this.sendCommands([{ code: schema.code, value: control }], true);
        })
            .setProps({
            minStep: 50,
        });
    }
}
exports.default = WindowCoveringAccessory;
//# sourceMappingURL=WindowCoveringAccessory.js.map
