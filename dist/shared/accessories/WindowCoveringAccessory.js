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
            this.configureStopSwitch(i);
        }
        this.scheduleStartupMovementReconcile(amount);
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
        const firstBooleanDefault = (defaultValue, ...values) => {
            for (const value of values) {
                if (typeof value === 'boolean') {
                    return value;
                }
            }
            return defaultValue;
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
            trustExternalControlState: firstBooleanDefault(true, channelConfig?.trustExternalControlState, windowCovering?.trustExternalControlState, deviceConfig?.trustExternalControlState),
            externalControlStateMode: channelConfig?.externalControlStateMode || windowCovering?.externalControlStateMode || deviceConfig?.externalControlStateMode || 'followReverseControl',
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
    getServiceForIndex(i) {
        return this.accessory.getService(SCHEMA_CODE[i].NAME) ||
            this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
    }
    getExternalMovementTarget(i) {
        return this.externalMovementTargets?.get(i);
    }
    setExternalMovementTarget(i, targetPosition, options = {}) {
        if (!this.externalMovementTargets) {
            this.externalMovementTargets = new Map();
        }
        if (!this.externalMovementForceFinalStates) {
            this.externalMovementForceFinalStates = new Map();
        }
        if (!this.targetPosition) {
            this.targetPosition = {};
        }
        const target = this.toLimitedPosition(targetPosition);
        this.externalMovementTargets.set(i, target);
        this.externalMovementForceFinalStates.set(i, !!options.forceFinalState);
        this.targetPosition[i] = target;
        const service = this.getServiceForIndex(i);
        service.updateCharacteristic(this.Characteristic.TargetPosition, target);
        service.updateCharacteristic(this.Characteristic.PositionState, this.getPositionStateValue(i));
    }
    clearExternalMovementTarget(i) {
        this.externalMovementTargets?.delete(i);
        this.externalMovementForceFinalStates?.delete(i);
    }
    shouldForceExternalMovementFinalState(i) {
        return this.externalMovementForceFinalStates?.get(i) === true;
    }
    markHomeKitCommandEchoWindow(i) {
        if (!this.homeKitCommandEchoUntil) {
            this.homeKitCommandEchoUntil = new Map();
        }
        this.homeKitCommandEchoUntil.set(i, Date.now() + 5000);
    }
    isWithinHomeKitCommandEchoWindow(i) {
        return Date.now() < (this.homeKitCommandEchoUntil?.get(i) ?? 0);
    }
    getCurrentHomeKitPosition(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const targetControlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        if (currentSchema) {
            return this.rawPositionToHomeKit(this.getStatus(currentSchema.code)?.value, i);
        }
        if (targetSchema) {
            return this.rawPositionToHomeKit(this.getStatus(targetSchema.code)?.value, i);
        }
        if (targetControlSchema) {
            return this.getControlPosition(this.getStatus(targetControlSchema.code)?.value, i);
        }
        return this.targetPosition?.[i] ?? 50;
    }
    scheduleStartupMovementReconcile(amount = 1) {
        if (this.startupMovementTimer) {
            clearTimeout(this.startupMovementTimer);
        }
        this.startupMovementTimer = setTimeout(() => {
            this.startupMovementTimer = undefined;
            for (let i = 0; i < amount; i++) {
                const controlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
                const controlStatus = controlSchema ? this.getStatus(controlSchema.code) : undefined;
                if (controlSchema && this.isControlMoving(controlStatus?.value)) {
                    this.setExternalMovementTarget(i, this.getExternalControlPosition(controlStatus?.value, i), { forceFinalState: true });
                    this.scheduleExternalMovementSettle(i, `startup ${controlSchema.code}=${controlStatus?.value}`);
                    continue;
                }
                if (!this.isCurrentAtTarget(i)) {
                    this.scheduleExternalMovementSettle(i, 'startup position mismatch');
                }
            }
        }, 1500);
    }
    getBaseControlPosition(value, i = 0) {
        const lowerValue = String(value ?? '').toLowerCase();
        if (lowerValue === 'close' || lowerValue === 'fz') {
            return 0;
        }
        if (lowerValue === 'stop' || lowerValue === 'stopped') {
            return this.targetPosition?.[i] ?? 50;
        }
        if (lowerValue === 'open' || lowerValue === 'zz') {
            return 100;
        }
        this.log.warn('Unknown WindowCovering position control value:', value);
        return 50;
    }
    getControlPosition(value, i = 0) {
        const position = this.getBaseControlPosition(value, i);
        if (this.getWindowCoveringOptions(i).reverseControl && position !== 50) {
            return 100 - position;
        }
        return position;
    }
    getExternalControlPosition(value, i = 0) {
        const position = this.getBaseControlPosition(value, i);
        const options = this.getWindowCoveringOptions(i);
        const mode = String(options.externalControlStateMode || 'followReverseControl');
        const shouldReverse = mode === 'reversed' || (mode !== 'normal' && options.reverseControl === true);
        if (shouldReverse && position !== 50) {
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
        // Prefer real percentage DPs over command strings. Tuya app commands can
        // be reversed by motor calibration; converted positions are authoritative.
        if (currentSchema && targetSchema) {
            const currentStatus = this.getStatus(currentSchema.code);
            const targetStatus = this.getStatus(targetSchema.code);
            const currentPosition = this.rawPositionToHomeKit(currentStatus?.value, i);
            const targetPosition = this.rawPositionToHomeKit(targetStatus?.value, i);
            if (Math.abs(targetPosition - currentPosition) > 1) {
                return targetPosition > currentPosition ? INCREASING : DECREASING;
            }
        }
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                return STOPPED;
            }
            if (this.isControlMoving(controlStatus?.value)) {
                const targetFromCommand = this.getExternalMovementTarget(i) !== undefined
                    ? this.getExternalMovementTarget(i)
                    : this.getControlPosition(controlStatus?.value, i);
                const currentPosition = this.getCurrentHomeKitPosition(i);
                if (targetFromCommand > currentPosition) {
                    return INCREASING;
                }
                if (targetFromCommand < currentPosition) {
                    return DECREASING;
                }
                if (targetFromCommand >= 100) {
                    return INCREASING;
                }
                if (targetFromCommand <= 0) {
                    return DECREASING;
                }
            }
        }
        return STOPPED;
    }

    configureCurrentPosition(i) {
        const currentSchema = this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        const targetControlSchema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        const service = this.getServiceForIndex(i);
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
        const service = this.getServiceForIndex(i);
        service.getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => this.getPositionStateValue(i));
    }
    configureTargetPositionPercent(i) {
        const schema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT);
        if (!schema) {
            return;
        }
        const service = this.getServiceForIndex(i);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            const externalTarget = this.getExternalMovementTarget(i);
            if (externalTarget !== undefined) {
                return externalTarget;
            }
            const status = this.getStatus(schema.code);
            return this.rawPositionToHomeKit(status?.value, i);
        })
            .onSet(async (value) => {
            if (!this.targetPosition) {
                this.targetPosition = {};
            }
            this.targetPosition[i] = this.toLimitedPosition(value);
            this.markHomeKitCommandEchoWindow(i);
            this.clearExternalMovementTarget(i);
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
        const service = this.getServiceForIndex(i);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            const externalTarget = this.getExternalMovementTarget(i);
            if (externalTarget !== undefined) {
                return externalTarget;
            }
            const status = this.getStatus(schema.code);
            return this.getControlPosition(status?.value, i);
        })
            .onSet(async (value) => {
            if (!this.targetPosition) {
                this.targetPosition = {};
            }
            this.targetPosition[i] = this.toLimitedPosition(value);
            this.markHomeKitCommandEchoWindow(i);
            this.clearExternalMovementTarget(i);
            this.clearExternalMovementTimer(i);
            const control = this.getControlCommand(value, i, isOldSchema);
            await this.sendCommands([{ code: schema.code, value: control }], true);
        })
            .setProps({
            minStep: 50,
        });
    }
    configureStopSwitch(i) {
        const schema = this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL);
        if (!schema) {
            return;
        }
        const subtype = `blind_stop_${SCHEMA_CODE[i].NAME}`;
        const defaultName = i === 0 ? 'Stop Blind' : `Stop Blind ${i + 1}`;
        const service = this.accessory.getServiceById(this.Service.Switch, subtype) ||
            this.accessory.addService(this.Service.Switch, defaultName, subtype);
        const safeName = this.getPreservedServiceName ? this.getPreservedServiceName(service, defaultName) : defaultName;
        service.setCharacteristic(this.Characteristic.Name, safeName)
            .setCharacteristic(this.Characteristic.ConfiguredName, safeName);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => false)
            .onSet(async (value) => {
            if (value !== true) {
                return;
            }
            const stopValue = this.getStopCommandForControlSchema(schema);
            this.clearExternalMovementTimer(i);
            this.clearExternalMovementTarget(i);
            this.setStatusValue(schema.code, stopValue);
            await this.sendCommands([{ code: schema.code, value: stopValue }], false);
            await this.updateAllValues();
            setTimeout(() => service.updateCharacteristic(this.Characteristic.On, false), 500);
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
        const externalTarget = this.getExternalMovementTarget(i);
        if (externalTarget !== undefined) {
            // When the movement came from the Tuya app and the user trusts
            // external control state, force the final HomeKit endpoint using the
            // same reverseControl-aware mapping as HomeKit commands. This fixes
            // motors where Tuya's percent DPs remain stale or report the
            // calibrated opposite after app-side open/close commands.
            if (this.shouldForceExternalMovementFinalState(i) || (!targetSchema && !currentSchema)) {
                const rawTarget = this.homeKitPositionToRaw(externalTarget, i);
                if (targetSchema) {
                    this.setStatusValue(targetSchema.code, rawTarget);
                }
                if (currentSchema) {
                    this.setStatusValue(currentSchema.code, rawTarget);
                }
            }
            if (controlSchema) {
                const controlStatus = this.getStatus(controlSchema.code);
                if (this.isControlMoving(controlStatus?.value)) {
                    this.setStatusValue(controlSchema.code, this.getStopCommandForControlSchema(controlSchema));
                }
            }
            this.clearExternalMovementTarget(i);
            await this.updateAllValues();
            return;
        }
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
                this.clearExternalMovementTarget(i);
                await this.updateAllValues();
                continue;
            }
            if (controlUpdate && this.isControlMoving(controlUpdate.value)) {
                const options = this.getWindowCoveringOptions(i);
                const isHomeKitEcho = this.isWithinHomeKitCommandEchoWindow(i);
                if (!isHomeKitEcho && options.trustExternalControlState !== false) {
                    const externalTarget = this.getExternalControlPosition(controlUpdate.value, i);
                    this.setExternalMovementTarget(i, externalTarget, { forceFinalState: true });
                    this.scheduleExternalMovementSettle(i, `${controlSchema?.code}=${controlUpdate.value}`);
                    await this.updateAllValues();
                    continue;
                }
                if (currentSchema || targetSchema) {
                    this.scheduleExternalMovementSettle(i, `${controlSchema?.code}=${controlUpdate.value}`);
                    await this.updateAllValues();
                    continue;
                }
                this.setExternalMovementTarget(i, this.getControlPosition(controlUpdate.value, i));
                this.scheduleExternalMovementSettle(i, `${controlSchema?.code}=${controlUpdate.value}`);
                continue;
            }
            if (this.isCurrentAtTarget(i)) {
                this.clearExternalMovementTimer(i);
                continue;
            }
            if (targetUpdate || currentUpdate) {
                this.scheduleExternalMovementSettle(i, 'position update');
            }
        }
    }
}
exports.default = WindowCoveringAccessory;
//# sourceMappingURL=WindowCoveringAccessory.js.map
