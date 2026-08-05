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
        this.removeLegacyStopSwitch();
        this.scheduleStartupMovementReconcile();
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
            externalControlStateMode: channelConfig?.externalControlStateMode || windowCovering?.externalControlStateMode || deviceConfig?.externalControlStateMode || 'normal',
            tapToStop: firstBooleanDefault(true, channelConfig?.tapToStop, windowCovering?.tapToStop, deviceConfig?.tapToStop),
            doubleClickToClose: firstBooleanDefault(true, channelConfig?.doubleClickToClose, windowCovering?.doubleClickToClose, deviceConfig?.doubleClickToClose),
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
    getService() {
        return this.accessory.getService(this.Service.WindowCovering) ||
            this.accessory.addService(this.Service.WindowCovering);
    }
    getCurrentHomeKitPosition() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        if (currentSchema) {
            return this.rawPositionToHomeKit(this.getStatus(currentSchema.code)?.value);
        }
        if (targetSchema) {
            return this.rawPositionToHomeKit(this.getStatus(targetSchema.code)?.value);
        }
        if (controlSchema) {
            return this.controlValueToPosition(this.getStatus(controlSchema.code)?.value);
        }
        return this.targetPosition ?? 50;
    }
    setExternalMovementTarget(targetPosition, options = {}) {
        this.externalMovementTarget = this.toLimitedPosition(targetPosition);
        this.externalMovementForceFinalState = !!options.forceFinalState;
        this.targetPosition = this.externalMovementTarget;
        const service = this.getService();
        service.updateCharacteristic(this.Characteristic.TargetPosition, this.externalMovementTarget);
        service.updateCharacteristic(this.Characteristic.PositionState, this.getPositionStateValue());
    }
    clearExternalMovementTarget() {
        this.externalMovementTarget = undefined;
        this.externalMovementForceFinalState = false;
    }
    markHomeKitCommandEchoWindow() {
        this.homeKitCommandEchoUntil = Date.now() + 5000;
    }
    isWithinHomeKitCommandEchoWindow() {
        return Date.now() < (this.homeKitCommandEchoUntil ?? 0);
    }
    controlValueToBasePosition(value) {
        const lowerValue = String(value ?? '').toLowerCase();
        if (lowerValue === 'open' || lowerValue === 'zz') {
            return 100;
        }
        if (lowerValue === 'close' || lowerValue === 'fz') {
            return 0;
        }
        if (lowerValue === 'stop' || lowerValue === 'stopped') {
            return this.targetPosition ?? this.getCurrentHomeKitPosition();
        }
        return undefined;
    }
    controlValueToExternalPosition(value) {
        const position = this.controlValueToBasePosition(value);
        if (position === undefined) {
            return undefined;
        }
        const options = this.getWindowCoveringOptions();
        const mode = String(options.externalControlStateMode || 'followReverseControl');
        const shouldReverse = mode === 'reversed' || (mode === 'followReverseControl' && options.reverseControl === true);
        if (shouldReverse && position !== 50) {
            return 100 - position;
        }
        return position;
    }
    controlValueToSemanticPosition(value) {
        // Deprecated internal name kept for compatibility. External Tuya-app
        // open/close events must follow the same physical reversal as the
        // HomeKit command mapping, otherwise calibrated motors can report
        // Tuya-app Open as HomeKit Closing/Closed.
        return this.controlValueToExternalPosition(value);
    }
    getStopCommandForControlSchema(schema) {
        const range = Array.isArray(schema?.property?.range) ? schema.property.range.map((item) => String(item).toLowerCase()) : [];
        return range.length > 0 && !range.includes('open') ? 'STOP' : 'stop';
    }
    scheduleStartupMovementReconcile() {
        if (this.startupMovementTimer) {
            clearTimeout(this.startupMovementTimer);
        }
        this.startupMovementTimer = setTimeout(() => {
            this.startupMovementTimer = undefined;
            const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
            const controlStatus = controlSchema ? this.getStatus(controlSchema.code) : undefined;
            if (controlSchema && this.isControlMoving(controlStatus?.value)) {
                const semanticTarget = this.controlValueToSemanticPosition(controlStatus?.value);
                this.setExternalMovementTarget(semanticTarget ?? this.controlValueToPosition(controlStatus?.value), { forceFinalState: semanticTarget !== undefined });
                this.scheduleExternalMovementSettle(`startup ${controlSchema.code}=${controlStatus?.value}`);
                return;
            }
            if (controlSchema && this.isControlStopped(controlStatus?.value)) {
                this.setLocalStoppedAtCurrentPosition();
                this.updateAllValues();
                return;
            }
            if (!this.isCurrentAtTarget()) {
                this.scheduleExternalMovementSettle('startup position mismatch');
            }
        }, 1500);
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

    setLocalStoppedAtCurrentPosition(position) {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const controlSchema = this.getSchema(...SCHEMA_CODE.CONTROL);
        const currentPosition = this.toLimitedPosition(position ?? this.getCurrentHomeKitPosition());
        this.targetPosition = currentPosition;
        if (targetSchema) {
            this.setStatusValue(targetSchema.code, this.homeKitPositionToRaw(currentPosition));
        }
        if (!currentSchema && targetSchema) {
            this.setStatusValue(targetSchema.code, this.homeKitPositionToRaw(currentPosition));
        }
        if (controlSchema) {
            this.setStatusValue(controlSchema.code, this.getStopCommandForControlSchema(controlSchema));
        }
        const service = this.getService();
        service.updateCharacteristic(this.Characteristic.CurrentPosition, currentPosition);
        service.updateCharacteristic(this.Characteristic.TargetPosition, currentPosition);
        service.updateCharacteristic(this.Characteristic.PositionState, this.Characteristic.PositionState.STOPPED);
        return currentPosition;
    }
    async stopAtCurrentPosition(controlSchema, targetSchema, reason = 'tap') {
        this.clearExternalMovementTimer();
        this.clearExternalMovementTarget();
        const currentPosition = this.setLocalStoppedAtCurrentPosition();
        const commands = [];
        if (controlSchema) {
            commands.push({ code: controlSchema.code, value: this.getStopCommandForControlSchema(controlSchema) });
        }
        else if (targetSchema) {
            commands.push({ code: targetSchema.code, value: this.homeKitPositionToRaw(currentPosition) });
        }
        if (commands.length) {
            await this.sendCommands(commands, false);
        }
        await this.updateAllValues();
    }
    shouldStopOnTargetTap(targetPosition) {
        const options = this.getWindowCoveringOptions();
        if (options.tapToStop === false) {
            return false;
        }
        if (targetPosition > 5 && targetPosition < 95) {
            return false;
        }
        if (this.externalMovementTarget !== undefined) {
            return true;
        }
        return this.getPositionStateValue() !== this.Characteristic.PositionState.STOPPED;
    }
    /**
     * Configure CurrentPosition characteristic.
     * Read-only value showing actual blind position (0-100%).
     */
    configureCurrentPosition() {
        const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_POSITION);
        const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_POSITION) ||
            this.getSchema(...SCHEMA_CODE.POSITION);
        const service = this.getService();
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
        }
        // If movement was initiated outside HomeKit from the Tuya app, or from a
        // HomeKit tap that has not settled yet, keep HomeKit direction aligned to
        // the temporary target instead of stale Tuya percent DPs.
        if (this.externalMovementTarget !== undefined) {
            const currentPosition = this.getCurrentHomeKitPosition();
            if (Math.abs(this.externalMovementTarget - currentPosition) > 1) {
                return this.externalMovementTarget > currentPosition ? INCREASING : DECREASING;
            }
            return STOPPED;
        }
        // Prefer actual/target percentage DPs over open/close command DPs for
        // normal steady-state reads. Tuya calibration can make command strings
        // look reversed, but percentage values usually carry the real position.
        if (currentSchema && targetSchema) {
            const currentStatus = this.getStatus(currentSchema.code);
            const targetStatus = this.getStatus(targetSchema.code);
            const currentPos = this.rawPositionToHomeKit(currentStatus?.value);
            const targetPos = this.rawPositionToHomeKit(targetStatus?.value);
            if (Math.abs(targetPos - currentPos) > 1) {
                return targetPos > currentPos ? INCREASING : DECREASING;
            }
        }
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlMoving(controlStatus?.value)) {
                const targetFromCommand = this.externalMovementTarget !== undefined
                    ? this.externalMovementTarget
                    : this.controlValueToPosition(controlStatus?.value);
                const currentPosition = this.getCurrentHomeKitPosition();
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

    configurePositionState() {
        const service = this.getService();
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
        const service = this.getService();
        service.getCharacteristic(this.Characteristic.TargetPosition)
            .onGet(() => {
            if (this.externalMovementTarget !== undefined) {
                return this.externalMovementTarget;
            }
            if (this.targetPosition !== undefined && this.getPositionStateValue() === this.Characteristic.PositionState.STOPPED) {
                return this.targetPosition;
            }
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
            let targetPos = this.toLimitedPosition(value);
            const currentPosition = this.getCurrentHomeKitPosition();
            const options = this.getWindowCoveringOptions();
            const now = Date.now();
            if (this.shouldStopOnTargetTap(targetPos)) {
                if (options.doubleClickToClose !== false && this.partialOpenDoubleClickUntil && now < this.partialOpenDoubleClickUntil && targetPos >= 95) {
                    targetPos = 0;
                    this.partialOpenDoubleClickUntil = 0;
                }
                else {
                    await this.stopAtCurrentPosition(controlSchema, targetSchema, 'tap-to-stop');
                    return;
                }
            }
            if (currentPosition > 5 && currentPosition < 95 && targetPos >= 95 && options.doubleClickToClose !== false) {
                this.partialOpenDoubleClickUntil = now + 900;
            }
            else {
                this.partialOpenDoubleClickUntil = 0;
            }
            this.targetPosition = targetPos;
            this.markHomeKitCommandEchoWindow();
            this.clearExternalMovementTarget();
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
    removeLegacyStopSwitch() {
        const service = this.accessory.getServiceById(this.Service.Switch, 'blind_stop');
        if (service) {
            this.accessory.removeService(service);
        }
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
            this.setLocalStoppedAtCurrentPosition();
            this.sendCommands([{ code: controlSchema.code, value: this.getStopCommandForControlSchema(controlSchema) }]);
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
        if (this.externalMovementTarget !== undefined) {
            // For Tuya-app open/close commands, the command text is more reliable
            // than the raw numeric target on several calibrated motors. Force the
            // local HomeKit current/target to the semantic command endpoint at
            // settle time so Apple Home does not end at the opposite state.
            if (this.externalMovementForceFinalState || (!targetSchema && !currentSchema)) {
                const rawTarget = this.homeKitPositionToRaw(this.externalMovementTarget);
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
                    this.setStatusValue(controlSchema.code, 'stop');
                }
            }
            this.clearExternalMovementTarget();
            await this.updateAllValues();
            return;
        }
        if (controlSchema) {
            const controlStatus = this.getStatus(controlSchema.code);
            if (this.isControlStopped(controlStatus?.value)) {
                this.setLocalStoppedAtCurrentPosition();
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
            this.clearExternalMovementTarget();
            this.setLocalStoppedAtCurrentPosition();
            await this.updateAllValues();
            return;
        }
        if (controlUpdate && this.isControlMoving(controlUpdate.value)) {
            const options = this.getWindowCoveringOptions(controlSchema?.code ?? 'control');
            const semanticTarget = this.controlValueToSemanticPosition(controlUpdate.value);
            const isHomeKitEcho = this.isWithinHomeKitCommandEchoWindow();
            if (!isHomeKitEcho && options.trustExternalControlState && semanticTarget !== undefined) {
                this.setExternalMovementTarget(semanticTarget, { forceFinalState: true });
                this.scheduleExternalMovementSettle(`${controlSchema?.code}=${controlUpdate.value}`);
                await this.updateAllValues();
                return;
            }
            if (currentSchema || targetSchema) {
                this.scheduleExternalMovementSettle(`${controlSchema?.code}=${controlUpdate.value}`);
                await this.updateAllValues();
                return;
            }
            this.setExternalMovementTarget(this.controlValueToPosition(controlUpdate.value));
            this.scheduleExternalMovementSettle(`${controlSchema?.code}=${controlUpdate.value}`);
            return;
        }
        if (this.isCurrentAtTarget()) {
            this.clearExternalMovementTimer();
            return;
        }
        if (targetUpdate || currentUpdate) {
            this.scheduleExternalMovementSettle('position update');
        }
    }
}
exports.default = BlindsAccessory;
//# sourceMappingURL=BlindsAccessory.js.map
