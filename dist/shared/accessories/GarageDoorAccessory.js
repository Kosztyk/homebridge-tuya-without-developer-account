"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    CURRENT_DOOR_STATE: ['doorcontact_state'],
    TARGET_DOOR_STATE: ['switch_1'],
};
// Allow typical garage travel time, but do not leave a requested target stuck
// forever if a Tuya status report never arrives.
const TARGET_TRANSITION_TIMEOUT_MS = 45000;
class GarageDoorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.TARGET_DOOR_STATE];
    }
    configureServices() {
        this.configureCurrentDoorState();
        this.configureTargetDoorState();
    }
    mainService() {
        return this.accessory.getService(this.Service.GarageDoorOpener)
            || this.accessory.addService(this.Service.GarageDoorOpener);
    }
    // A physical remote changes the contact sensor, but may not update switch_1.
    // switch_1 is a command / cached target, not a motion-direction sensor.
    readContactState() {
        const schema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
        const status = schema && this.getStatus(schema.code);
        return typeof status?.value === 'boolean' ? status.value : undefined;
    }
    clearPendingTarget() {
        if (this.pendingTargetTimer !== undefined) {
            clearTimeout(this.pendingTargetTimer);
            this.pendingTargetTimer = undefined;
        }
        this.pendingTarget = undefined;
        this.pendingTargetExpiresAt = undefined;
        // Distinguish a stale timer from a more recent command.
        this.pendingTargetGeneration = (this.pendingTargetGeneration || 0) + 1;
    }
    beginPendingTarget(target) {
        this.clearPendingTarget();
        this.pendingTarget = target;
        this.pendingTargetExpiresAt = Date.now() + TARGET_TRANSITION_TIMEOUT_MS;
        const generation = this.pendingTargetGeneration;
        this.pendingTargetTimer = setTimeout(() => {
            if (this.pendingTargetGeneration !== generation) {
                return;
            }
            this.clearPendingTarget();
            // HomeKit may not poll the characteristic again. Proactively
            // announce the physical/fallback state after an expired command.
            this.refreshTargetDoorState();
        }, TARGET_TRANSITION_TIMEOUT_MS);
        if (typeof this.pendingTargetTimer?.unref === 'function') {
            this.pendingTargetTimer.unref();
        }
    }
    getResolvedTargetDoorState() {
        const { OPEN, CLOSED } = this.Characteristic.TargetDoorState;
        const sensed = this.readContactState();
        if (this.pendingTarget !== undefined) {
            if (Date.now() >= this.pendingTargetExpiresAt) {
                this.clearPendingTarget();
            }
            else if (sensed !== undefined && sensed === (this.pendingTarget === OPEN)) {
                // Our requested position was reached: external status is now
                // authoritative, and the temporary target can be cleared.
                this.clearPendingTarget();
            }
            else {
                return this.pendingTarget;
            }
        }
        if (sensed !== undefined) {
            this.lastKnownTarget = sensed ? OPEN : CLOSED;
            return this.lastKnownTarget;
        }
        // The contact sensor is unavailable. Fall back to switch_1, but do
        // not throw when the cached switch status is also unavailable.
        const switchSchema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
        const switchStatus = switchSchema && this.getStatus(switchSchema.code);
        if (typeof switchStatus?.value === 'boolean') {
            this.lastKnownTarget = switchStatus.value ? OPEN : CLOSED;
            return this.lastKnownTarget;
        }
        return this.lastKnownTarget ?? CLOSED;
    }
    refreshTargetDoorState() {
        const characteristic = this.mainService().getCharacteristic(this.Characteristic.TargetDoorState);
        characteristic.updateValue(this.getResolvedTargetDoorState());
    }
    configureCurrentDoorState() {
        const { OPEN, CLOSED, STOPPED } = this.Characteristic.CurrentDoorState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentDoorState)
            .onGet(() => {
            const sensed = this.readContactState();
            if (sensed === undefined) {
                return STOPPED;
            }
            // The boolean contact indicates an open/not-closed vs. closed
            // condition. It does not establish OPENING/CLOSING direction.
            return sensed ? OPEN : CLOSED;
        });
    }
    configureTargetDoorState() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
        if (!schema) {
            return;
        }
        const { OPEN, CLOSED } = this.Characteristic.TargetDoorState;
        const characteristic = this.mainService().getCharacteristic(this.Characteristic.TargetDoorState);
        characteristic
            .onGet(() => this.getResolvedTargetDoorState())
            .onSet(async (value) => {
            const requested = value === OPEN ? OPEN : CLOSED;
            this.beginPendingTarget(requested);
            const generation = this.pendingTargetGeneration;
            try {
                // Preserve the original Tuya write mapping (OPEN=true,
                // CLOSED=false). Mark the pending intent before sending so
                // an immediate status refresh cannot overwrite it.
                const result = await this.sendCommands([{
                        code: schema.code,
                        value: requested === OPEN,
                    }]);
                if (result === false) {
                    throw new Error(`Tuya rejected garage-door command ${schema.code}`);
                }
            }
            catch (error) {
                // Only roll back the failed command, not a newer request.
                if (this.pendingTargetGeneration === generation) {
                    this.clearPendingTarget();
                    this.refreshTargetDoorState();
                }
                throw error;
            }
        });
    }
}
exports.default = GarageDoorAccessory;
//# sourceMappingURL=GarageDoorAccessory.js.map
