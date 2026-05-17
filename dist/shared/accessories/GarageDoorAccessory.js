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
        const { OPEN, CLOSED, OPENING, CLOSING, STOPPED } = this.Characteristic.CurrentDoorState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentDoorState)
            .onGet(() => {
            const currentSchema = this.getSchema(...SCHEMA_CODE.CURRENT_DOOR_STATE);
            const targetSchema = this.getSchema(...SCHEMA_CODE.TARGET_DOOR_STATE);
            if (!currentSchema || !targetSchema) {
                return STOPPED;
            }
            const currentStatus = this.getStatus(currentSchema.code);
            const targetStatus = this.getStatus(targetSchema.code);
            if (currentStatus.value === true && targetStatus.value === true) {
                return OPEN;
            }
            else if (currentStatus.value === false && targetStatus.value === false) {
                return CLOSED;
            }
            else if (currentStatus.value === false && targetStatus.value === true) {
                return OPENING;
            }
            else if (currentStatus.value === true && targetStatus.value === false) {
                return CLOSING;
            }
            return STOPPED;
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