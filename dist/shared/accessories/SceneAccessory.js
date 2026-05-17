"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
class SceneAccessory extends BaseAccessory_1.default {
    constructor(platform, accessory) {
        super(platform, accessory);
        const service = this.accessory.getService(this.Service.Switch)
            || this.accessory.addService(this.Service.Switch);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => false)
            .onSet(async (value) => {
            if (value === false) {
                return;
            }
            const deviceManager = this.platform.deviceManager;
            const res = await deviceManager.executeScene(this.device.owner_id, this.device.id);
            setTimeout(() => {
                service.getCharacteristic(this.Characteristic.On).updateValue(false);
            }, 150);
            if (res.success === false) {
                this.log.warn('ExecuteScene failed. homeId = %s, code = %s, msg = %s', this.device.owner_id, res.code, res.msg);
                const { HapStatusError, HAPStatus } = this.platform.api.hap;
                throw new HapStatusError(-70402 /* HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
            }
        });
    }
}
exports.default = SceneAccessory;
//# sourceMappingURL=SceneAccessory.js.map