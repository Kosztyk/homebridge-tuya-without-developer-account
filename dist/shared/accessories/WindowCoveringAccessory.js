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
        const firstNumber = (...values) => {
            for (const value of values) {
                const number = Number(value);
                if (Number.isFinite(number)) {
                    return number;
                }
            }
            return 35;
        };
        return {
            invertPosition: firstBoolean(channelConfig?.invertPosition, windowCovering?.invertPosition, deviceConfig?.invertPosition),
            reverseControl: firstBoolean(channelConfig?.reverseControl, windowCovering?.reverseControl, deviceConfig?.reverseControl, deviceConfig?.reverse),
            settleSeconds: (0, util_1.limit)(firstNumber(channelConfig?.settleSeconds, windowCovering?.settleSeconds, deviceConfig?.settleSeconds), 5, 180),
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
    isControlStopped(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        return lowerValue === 'stop' || lowerValue === 'stopped';
    }
    isControlMoving(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        return lowerValue === 'open' || lowerValue === 'close' || lowerValue === 'zz' || lowerValue === 'fz';
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
    getStopCommandForControlSchema(schema) {
        const range = Array.isArray(schema?.property?.range) ? schema.property.range.map((item) => String(item).toLowerCase()) : [];
        return range.length > 0 && !range.includes('open') ? 'STOP' : 'stop';
    }
    getStatusUpdate(status, code) {
        if (!code || !Array.isArray(status)) {
            return undefined;
        }
        return status.find((item) => item && item.code === code);
    }
    setStatusValue(code, value) {
        if (!this.device || !code) {
            return false;
        }
        const current = this.device.status.find((item) => item.code === code);
        if (current) {
            current.value = value;
        }
        else {
            this.device.status.push({ code, value });
        }
        return true;
    }
    getPositionStateValue(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const controlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        const { DECREASING, INCREASING, STOPPED } = this.Characteristic.PositionState;
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                return STOPPED;
            }
            if (this.isControlMoving(controlStatus?.value)) {
                const targetFromCommand = this.getControlPosition(controlStatus?.value, i);
                if (targetFromCommand >= 100) {
                    return INCREASING;
                }
                if (targetFromCommand <= 0) {
                    return DECREASING;
                }
            }
        }
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
        const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
        service.getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => this.getPositionStateValue(i));
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
            this.clearExternalMovementTimer(i);
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
            this.clearExternalMovementTimer(i);
            const control = this.getControlCommand(value, i, isOldSchema);
            await this.sendCommands([{ code: schema.code, value: control }], true);
        })
            .setProps({
            minStep: 50,
        });
    }
    clearExternalMovementTimer(i) {
        if (!this.externalMovementTimers) {
            return;
        }
        const timer = this.externalMovementTimers.get(i);
        if (timer) {
            clearTimeout(timer);
            this.externalMovementTimers.delete(i);
        }
    }
    scheduleExternalMovementSettle(i, reason) {
        if (!this.externalMovementTimers) {
            this.externalMovementTimers = new Map();
        }
        this.clearExternalMovementTimer(i);
        const delay = this.getWindowCoveringOptions(i).settleSeconds * 1000;
        const timer = setTimeout(async () => {
            this.externalMovementTimers?.delete(i);
            try {
                await this.settleExternalMovement(i, reason);
            }
            catch (error) {
                this.log.warn('Failed to settle external window-covering movement: %s', error instanceof Error ? error.message : error);
            }
        }, delay);
        this.externalMovementTimers.set(i, timer);
    }
    isCurrentAtTarget(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        if (!currentSchema || !targetSchema) {
            return true;
        }
        const currentStatus = this.getStatus(currentSchema.code);
        const targetStatus = this.getStatus(targetSchema.code);
        if (!currentStatus || !targetStatus) {
            return true;
        }
        const currentPosition = this.rawPositionToHomeKit(currentStatus.value, i);
        const targetPosition = this.rawPositionToHomeKit(targetStatus.value, i);
        return Math.abs(currentPosition - targetPosition) <= 1;
    }
    async refreshDeviceFromCloud() {
        if (!this.device?.id) {
            return false;
        }
        const manager = this.platform.deviceManager || this.deviceManager;
        if (!manager || typeof manager.updateDevice !== 'function') {
            return false;
        }
        try {
            await manager.updateDevice(this.device.id);
            return true;
        }
        catch (error) {
            this.log.debug('Cloud refresh after external movement failed: %s', error instanceof Error ? error.message : error);
            return false;
        }
    }
    async settleExternalMovement(i, reason) {
        await this.refreshDeviceFromCloud();
        const controlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                await this.updateAllValues();
                return;
            }
        }
        if (this.isCurrentAtTarget(i)) {
            if (controlSchema) {
                const controlStatus = this.getStatus(controlSchema.code);
                if (this.isControlMoving(controlStatus?.value)) {
                    this.setStatusValue(controlSchema.code, this.getStopCommandForControlSchema(controlSchema));
                }
            }
            await this.updateAllValues();
            return;
        }
        if (currentSchema && targetSchema) {
            const targetStatus = this.getStatus(targetSchema.code);
            if (targetStatus) {
                this.log.debug('Settling external window-covering movement for %s after %s: %s=%o -> %s=%o', SCHEMA_CODE[i].NAME, reason, currentSchema.code, this.getStatus(currentSchema.code)?.value, currentSchema.code, targetStatus.value);
                this.setStatusValue(currentSchema.code, targetStatus.value);
            }
        }
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlMoving(controlStatus?.value)) {
                this.setStatusValue(controlSchema.code, this.getStopCommandForControlSchema(controlSchema));
            }
        }
        await this.updateAllValues();
    }
    async onDeviceStatusUpdate(status) {
        await super.onDeviceStatusUpdate(status);
        for (let i = 0; i < SCHEMA_CODE.length; i++) {
            const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
            const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
            const controlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
            if (!currentSchema && !targetSchema && !controlSchema) {
                continue;
            }
            const currentUpdate = currentSchema ? this.getStatusUpdate(status, currentSchema.code) : undefined;
            const targetUpdate = targetSchema ? this.getStatusUpdate(status, targetSchema.code) : undefined;
            const controlUpdate = controlSchema ? this.getStatusUpdate(status, controlSchema.code) : undefined;
            if (controlUpdate && this.isControlStopped(controlUpdate.value)) {
                this.clearExternalMovementTimer(i);
                await this.updateAllValues();
                continue;
            }
            if (this.isCurrentAtTarget(i)) {
                this.clearExternalMovementTimer(i);
                continue;
            }
            if ((controlUpdate && this.isControlMoving(controlUpdate.value)) || targetUpdate || currentUpdate) {
                this.scheduleExternalMovementSettle(i, controlUpdate ? `${controlSchema?.code}=${controlUpdate.value}` : 'position update');
            }
        }
    }
}
exports.default = WindowCoveringAccessory;
//# sourceMappingURL=WindowCoveringAccessory.js.map
