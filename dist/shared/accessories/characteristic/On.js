"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureOn = configureOn;
function configureOn(accessory, service, schema) {
    if (!schema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(schema.code)
            || accessory.accessory.addService(accessory.Service.Switch, schema.code, schema.code);
    }
    service.getCharacteristic(accessory.Characteristic.On)
        .onGet(() => {
        accessory.checkOnlineStatus();
        const status = accessory.getStatus(schema.code);
        return status?.value ?? false;
    })
        .onSet(async (value) => {
        await accessory.sendCommands([{
                code: schema.code,
                value: value,
            }], true);
    });
}
//# sourceMappingURL=On.js.map