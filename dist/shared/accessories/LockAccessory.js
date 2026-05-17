"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    LOCK_CURRENT_STATE: ['open_close', 'closed_opened', 'lock_motor_state'],
    LOCK_TARGET_STATE: ['lock_motor_state'],
};
class LockAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.LOCK_CURRENT_STATE];
    }
    configureServices() {
        this.configureLockCurrentState();
        this.configureLockTargetState();
    }
    mainService() {
        return this.accessory.getService(this.Service.LockMechanism)
            || this.accessory.addService(this.Service.LockMechanism);
    }
    configureLockCurrentState() {
        const schema = this.getSchema(...SCHEMA_CODE.LOCK_CURRENT_STATE);
        if (!schema) {
            return;
        }
        const { UNSECURED, SECURED } = this.Characteristic.LockCurrentState;
        this.mainService().getCharacteristic(this.Characteristic.LockCurrentState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value ? UNSECURED : SECURED;
        });
    }
    configureLockTargetState() {
        const schema = this.getSchema(...SCHEMA_CODE.LOCK_TARGET_STATE);
        if (!schema) {
            return;
        }
        const { UNSECURED, SECURED } = this.Characteristic.LockTargetState;
        this.mainService().getCharacteristic(this.Characteristic.LockTargetState)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value ? UNSECURED : SECURED;
        })
            .onSet(async (value) => {
            const res = await this.deviceManager.getLockTemporaryKey(this.device.id);
            if (!res.success) {
                return;
            }
            await this.deviceManager.sendLockCommands(this.device.id, res.result.ticket_id, (value === UNSECURED));
        });
    }
}
exports.default = LockAccessory;
//# sourceMappingURL=LockAccessory.js.map