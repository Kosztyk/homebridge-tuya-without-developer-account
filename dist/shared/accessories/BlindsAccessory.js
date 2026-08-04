"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    CONTROL: ['control', 'mach_operate'],
    CURRENT_POSITION: ['percent_state'],
    TARGET_POSITION: ['percent_control', 'position'],
    POSITION: ['position'],
};
/**
 * BlindsAccessory – handles roller motor shades and blinds.
 * Supports position control with tracking and state management.
 *
 * Categories: 'mg' (blinds), 'mgmt' (motorized blinds)
 */
class BlindsAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.CONTROL];
    }
    configureServices() {
        this.configureCurrentPosition();
        this.configurePositionState();
        this.configureTargetPosition();
    }
    getWindowCoveringOptions(channelName = 'control') {
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
    rawPositionToHomeKit(value, channelName = 'control') {
        const position = this.toLimitedPosition(value);
        return this.getWindowCoveringOptions(channelName).invertPosition ? 100 - position : position;
    }
    homeKitPositionToRaw(value, channelName = 'control') {
        const position = this.toLimitedPosition(value);
        return this.getWindowCoveringOptions(channelName).invertPosition ? 100 - position : position;
    }
    isControlStopped(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        return lowerValue === 'stop' || lowerValue === 'stopped';
    }
    isControlMoving(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        return lowerValue === 'open' || lowerValue === 'close' || lowerValue === 'zz' || lowerValue === 'fz';
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
    /**
     * Configure CurrentPosition characteristic.
     * Read-only value showing actual blind position (0-100%).
     */
    configureCurrentPosition() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const service = this.accessory.getService(this.Service.WindowCovering) ||
            this.accessory.addService(this.Service.WindowCovering);
        service.getCharacteristic(this.Characteristic.CurrentPosition)
            .onGet(() => {
            // Prefer current position schema if available
            if (currentSchema) {
                const status = this.getStatus(currentSchema.code);
                return this.rawPositionToHomeKit(status?.value);
            }
            // Fall back to target position schema
            if (targetSchema) {
                const status = this.getStatus(targetSchema.code);
                return this.rawPositionToHomeKit(status?.value);
            }
            // Fall back to control command status (open/close/stop)
            const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
            if (controlSchema) {
                const status = this.getStatus(controlSchema.code);
                return this.controlValueToPosition(status?.value);
            }
            return 50; // Default to middle position
        });
    }
    getPositionStateValue() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        const { DECREASING, INCREASING, STOPPED } = this.Characteristic.PositionState;
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                return STOPPED;
            }
            if (this.isControlMoving(controlStatus?.value)) {
                const targetFromCommand = this.controlValueToPosition(controlStatus?.value);
                if (targetFromCommand >= 100) {
                    return INCREASING;
                }
                if (targetFromCommand <= 0) {
                    return DECREASING;
                }
            }
        }
        // If we don't have both current and target, assume stopped
        if (!currentSchema || !targetSchema) {
            return STOPPED;
        }
        const currentStatus = this.getStatus(currentSchema.code);
        const targetStatus = this.getStatus(targetSchema.code);
        const currentPos = this.rawPositionToHomeKit(currentStatus?.value);
        const targetPos = this.rawPositionToHomeKit(targetStatus?.value);
        if (targetPos > currentPos) {
            return INCREASING; // Moving up/open
        }
        else if (targetPos < currentPos) {
            return DECREASING; // Moving down/close
        }
        else {
            return STOPPED; // At target position
        }
    }
    /**
     * Configure PositionState characteristic.
     * Indicates if blinds are going up (INCREASING), down (DECREASING), or stopped.
     */
    configurePositionState() {
        const service = this.accessory.getService(this.Service.WindowCovering) ||
            this.accessory.addService(this.Service.WindowCovering);
        service.getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => this.getPositionStateValue());
    }
    /**
     * Configure TargetPosition characteristic.
     * Allows user to set desired blind position (0-100%).
     */
    configureTargetPosition() {
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        if (!controlSchema && !targetSchema) {
            this.log.warn('No target position schema available for blinds control');
            return;
        }
        const service = this.accessory.getService(this.Service.WindowCovering) ||
            this.accessory.addService(this.Service.WindowCovering);
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            // If target position schema exists, use it
            if (targetSchema) {
                const status = this.getStatus(targetSchema.code);
                return this.rawPositionToHomeKit(status?.value);
            }
            // Otherwise, use control schema (open/close/stop)
            if (controlSchema) {
                const status = this.getStatus(controlSchema.code);
                return this.controlValueToPosition(status?.value);
            }
            return this.targetPosition ?? 50;
        })
            .onSet(async (value) => {
            const targetPos = this.toLimitedPosition(value);
            this.targetPosition = targetPos;
            this.clearExternalMovementTimer();
            // Clear any pending reset timer
            if (this.positionResetTimer) {
                clearTimeout(this.positionResetTimer);
                this.positionResetTimer = undefined;
            }
            // If we have a percent_control schema, use it directly, applying optional inversion
            if (targetSchema && targetSchema.code !== 'control' && targetSchema.code !== 'mach_operate') {
                const rawTargetPos = this.homeKitPositionToRaw(targetPos);
                await this.sendCommands([{ code: targetSchema.code, value: rawTargetPos }], true);
            }
            else if (controlSchema) {
                // Otherwise, use the control schema (open/close/stop), applying optional reverseControl
                const controlValue = this.positionToControlValue(targetPos);
                await this.sendCommands([{ code: controlSchema.code, value: controlValue }], true);
                // Schedule idle reset after 30 seconds if device doesn't report position
                // This prevents the blinds from continuously moving
                this.positionResetTimer = setTimeout(() => {
                    this._resetToIdle();
                }, 30 * 1000);
            }
        });
    }
    /**
     * Convert HomeKit position value (0-100) to Tuya control value (open/close/stop).
     */
    positionToControlValue(position) {
        const { reverseControl } = this.getWindowCoveringOptions();
        if (position >= 95) {
            return reverseControl ? 'close' : 'open'; // or 'ZZ' for some devices
        }
        else if (position <= 5) {
            return reverseControl ? 'open' : 'close'; // or 'FZ' for some devices
        }
        else {
            return 'stop'; // or 'STOP' for some devices
        }
    }
    /**
     * Convert Tuya control value (open/close/stop) to HomeKit position (0-100).
     */
    controlValueToPosition(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        let position = 50;
        if (lowerValue === 'open' || lowerValue === 'zz') {
            position = 100;
        }
        else if (lowerValue === 'close' || lowerValue === 'fz') {
            position = 0;
        }
        else if (lowerValue === 'stop' || lowerValue === 'stopped') {
            position = this.targetPosition ?? 50;
        }
        if (this.getWindowCoveringOptions().reverseControl && position !== 50) {
            return 100 - position;
        }
        return position;
    }
    /**
     * Reset control to idle state after position movement completes.
     */
    _resetToIdle() {
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        if (controlSchema) {
            this.sendCommands([{ code: controlSchema.code, value: 'stop' }]);
        }
        this.positionResetTimer = undefined;
    }
    clearExternalMovementTimer() {
        if (this.externalMovementTimer) {
            clearTimeout(this.externalMovementTimer);
            this.externalMovementTimer = undefined;
        }
    }
    scheduleExternalMovementSettle(reason) {
        this.clearExternalMovementTimer();
        const delay = this.getWindowCoveringOptions().settleSeconds * 1000;
        this.externalMovementTimer = setTimeout(async () => {
            this.externalMovementTimer = undefined;
            try {
                await this.settleExternalMovement(reason);
            }
            catch (error) {
                this.log.warn('Failed to settle external blinds movement: %s', error instanceof Error ? error.message : error);
            }
        }, delay);
    }
    isCurrentAtTarget() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        if (!currentSchema || !targetSchema) {
            return true;
        }
        const currentStatus = this.getStatus(currentSchema.code);
        const targetStatus = this.getStatus(targetSchema.code);
        if (!currentStatus || !targetStatus) {
            return true;
        }
        const currentPosition = this.rawPositionToHomeKit(currentStatus.value);
        const targetPosition = this.rawPositionToHomeKit(targetStatus.value);
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
    async settleExternalMovement(reason) {
        await this.refreshDeviceFromCloud();
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                await this.updateAllValues();
                return;
            }
        }
        if (this.isCurrentAtTarget()) {
            if (controlSchema) {
                const controlStatus = this.getStatus(controlSchema.code);
                if (this.isControlMoving(controlStatus?.value)) {
                    this.setStatusValue(controlSchema.code, 'stop');
                }
            }
            await this.updateAllValues();
            return;
        }
        if (currentSchema && targetSchema) {
            const targetStatus = this.getStatus(targetSchema.code);
            if (targetStatus) {
                this.log.debug('Settling external blinds movement after %s: %s=%o -> %s=%o', reason, currentSchema.code, this.getStatus(currentSchema.code)?.value, currentSchema.code, targetStatus.value);
                this.setStatusValue(currentSchema.code, targetStatus.value);
            }
        }
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlMoving(controlStatus?.value)) {
                this.setStatusValue(controlSchema.code, 'stop');
            }
        }
        await this.updateAllValues();
    }
    /**
     * Handle device status updates from cloud/local.
     */
    async onDeviceStatusUpdate(status) {
        await super.onDeviceStatusUpdate(status);
        // If we receive a position update, clear the reset timer
        const positionUpdate = status.find(s => SCHEMA_CODE.CURRENT_POSITION.includes(s.code) ||
            (SCHEMA_CODE.TARGET_POSITION.includes(s.code) && s.code !== 'control'));
        if (positionUpdate && this.positionResetTimer) {
            clearTimeout(this.positionResetTimer);
            this.positionResetTimer = undefined;
        }
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        const currentUpdate = currentSchema ? this.getStatusUpdate(status, currentSchema.code) : undefined;
        const targetUpdate = targetSchema ? this.getStatusUpdate(status, targetSchema.code) : undefined;
        const controlUpdate = controlSchema ? this.getStatusUpdate(status, controlSchema.code) : undefined;
        if (controlUpdate && this.isControlStopped(controlUpdate.value)) {
            this.clearExternalMovementTimer();
            await this.updateAllValues();
            return;
        }
        if (this.isCurrentAtTarget()) {
            this.clearExternalMovementTimer();
            return;
        }
        if ((controlUpdate && this.isControlMoving(controlUpdate.value)) || targetUpdate || currentUpdate) {
            this.scheduleExternalMovementSettle(controlUpdate ? `${controlSchema?.code}=${controlUpdate.value}` : 'position update');
        }
    }
}
exports.default = BlindsAccessory;
//# sourceMappingURL=BlindsAccessory.js.map
