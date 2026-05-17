"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureActive = configureActive;
function configureActive(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const { ACTIVE, INACTIVE } = accessory.Characteristic.Active;
    service.getCharacteristic(accessory.Characteristic.Active)
        .onGet(() => {
        accessory.checkOnlineStatus();
        const status = accessory.getStatus(schema.code);
        return status.value ? ACTIVE : INACTIVE;
    })
        .onSet(async (value) => {
        await accessory.sendCommands([{
                code: schema.code,
                value: (value === ACTIVE) ? true : false,
            }], true);
    });
}
//# sourceMappingURL=Active.js.map