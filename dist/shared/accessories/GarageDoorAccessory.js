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
    configureCurrentDoorState() {
        const { OPEN, CLOSED, STOPPED } = this.Characteristic.CurrentDoorState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentDoorState)
            .onGet(() => {
            const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
            if (!currentSchema) {
                return STOPPED;
            }
            const currentStatus = this.getStatus(currentSchema.code);
            // Physical remotes update the contact sensor without updating switch_1.
            // A command value is not evidence of motion or of the actual door state.
            if (typeof currentStatus?.value !== 'boolean') {
                return STOPPED;
            }
            return currentStatus.value ? OPEN : CLOSED;
        });
    }
    configureTargetDoorState() {
        const schema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
        if (!schema) {
            return;
        }
        const { OPEN, CLOSED } = this.Characteristic.TargetDoorState;
        this.mainService().getCharacteristic(this.Characteristic.TargetDoorState)
            .onGet(() => {
            const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
            const currentStatus = currentSchema && this.getStatus(currentSchema.code);
            if (typeof currentStatus?.value === 'boolean') {
                return currentStatus.value ? OPEN : CLOSED;
            }
            const status = this.getStatus(schema.code);
            return status.value ? OPEN : CLOSED;
        })
            .onSet(async (value) => {
            await this.sendCommands([{
                    code: schema.code,
                    value: (value === OPEN) ? true : false,
                }]);
        });
    }
}
exports.default = GarageDoorAccessory;
//# sourceMappingURL=GarageDoorAccessory.js.map
