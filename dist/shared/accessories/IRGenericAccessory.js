"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Name_1 = require("./characteristic/Name");
class IRGenericAccessory extends BaseAccessory_1.default {
    configureServices() {
        let key_list = this.device.remote_keys?.key_list || [];
        // Max 99 services allowed (one for AccessoryInformation)
        if (key_list.length > 99) {
            this.log.warn(`Skipping ${key_list.length - 99} keys for ${this.device.name}, ` +
                'as we reached the limit of HomeKit (100 services per accessory)');
        }
        key_list = key_list.slice(0, 99);
        for (const key of key_list) {
            this.configureSwitch(key);
        }
    }
    configureSwitch(key) {
        const service = this.accessory.getService(key.key)
            || this.accessory.addService(this.Service.Switch, key.key, key.key);
        (0, Name_1.configureName)(this, service, key.key_name);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => false)
            .onSet(async (value) => {
            if (value === false) {
                return;
            }
            this.sendInfraredCommands(key);
            setTimeout(() => {
                service.getCharacteristic(this.Characteristic.On).updateValue(false);
            }, 150);
        });
    }
    async sendInfraredCommands(key) {
        const { parent_id, id } = this.device;
        const { category_id, remote_index } = this.device.remote_keys;
        if (key.learning_code) {
            await this.deviceManager.sendInfraredDIYCommands(parent_id, id, key.learning_code);
        }
        else {
            await this.deviceManager.sendInfraredCommands(parent_id, id, category_id, remote_index, key.key, key.key_id);
        }
    }
}
exports.default = IRGenericAccessory;
//# sourceMappingURL=IRGenericAccessory.js.map