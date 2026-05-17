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
                return (0, util_1.limit)(status.value, 0, 100);
            }
            // Fall back to target position schema
            if (targetSchema) {
                const status = this.getStatus(targetSchema.code);
                return (0, util_1.limit)(status.value, 0, 100);
            }
            // Fall back to control command status (open/close/stop)
            const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
            if (controlSchema) {
                const status = this.getStatus(controlSchema.code);
                return this.controlValueToPosition(status.value);
            }
            return 50; // Default to middle position
        });
    }
    /**
     * Configure PositionState characteristic.
     * Indicates if blinds are going up (INCREASING), down (DECREASING), or stopped.
     */
    configurePositionState() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const { DECREASING, INCREASING, STOPPED } = this.Characteristic.PositionState;
        const service = this.accessory.getService(this.Service.WindowCovering) ||
            this.accessory.addService(this.Service.WindowCovering);
        service.getCharacteristic(this.Characteristic.PositionState)
            .onGet(() => {
            // If we don't have both current and target, assume stopped
            if (!currentSchema || !targetSchema) {
                return STOPPED;
            }
            const currentStatus = this.getStatus(currentSchema.code);
            const targetStatus = this.getStatus(targetSchema.code);
            const currentPos = currentStatus.value;
            const targetPos = targetStatus.value;
            if (targetPos > currentPos) {
                return INCREASING; // Moving up/open
            }
            else if (targetPos < currentPos) {
                return DECREASING; // Moving down/close
            }
            else {
                return STOPPED; // At target position
            }
        });
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
                return (0, util_1.limit)(status.value, 0, 100);
            }
            // Otherwise, use control schema (open/close/stop)
            if (controlSchema) {
                const status = this.getStatus(controlSchema.code);
                return this.controlValueToPosition(status.value);
            }
            return this.targetPosition ?? 50;
        })
            .onSet(async (value) => {
            const targetPos = value;
            this.targetPosition = targetPos;
            // Clear any pending reset timer
            if (this.positionResetTimer) {
                clearTimeout(this.positionResetTimer);
                this.positionResetTimer = undefined;
            }
            // If we have a percent_control schema, use it directly
            if (targetSchema && targetSchema.code !== 'control' && targetSchema.code !== 'mach_operate') {
                await this.sendCommands([{ code: targetSchema.code, value: targetPos }], true);
            }
            else if (controlSchema) {
                // Otherwise, use the control schema (open/close/stop)
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
        if (position >= 95) {
            return 'open'; // or 'ZZ' for some devices
        }
        else if (position <= 5) {
            return 'close'; // or 'FZ' for some devices
        }
        else {
            return 'stop'; // or 'STOP' for some devices
        }
    }
    /**
     * Convert Tuya control value (open/close/stop) to HomeKit position (0-100).
     */
    controlValueToPosition(value) {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'open' || lowerValue === 'zz') {
            return 100;
        }
        else if (lowerValue === 'close' || lowerValue === 'fz') {
            return 0;
        }
        else if (lowerValue === 'stop' || lowerValue === 'stopped') {
            return 50;
        }
        return 50; // Default to middle
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
    /**
     * Handle device status updates from cloud/local.
     */
    async onDeviceStatusUpdate(status) {
        super.onDeviceStatusUpdate(status);
        // If we receive a position update, clear the reset timer
        const positionUpdate = status.find(s => SCHEMA_CODE.CURRENT_POSITION.includes(s.code) ||
            (SCHEMA_CODE.TARGET_POSITION.includes(s.code) && s.code !== 'control'));
        if (positionUpdate && this.positionResetTimer) {
            clearTimeout(this.positionResetTimer);
            this.positionResetTimer = undefined;
        }
    }
}
exports.default = BlindsAccessory;
//# sourceMappingURL=BlindsAccessory.js.map