"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureLockPhysicalControls = configureLockPhysicalControls;
function configureLockPhysicalControls(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const { CONTROL_LOCK_DISABLED, CONTROL_LOCK_ENABLED } = accessory.Characteristic.LockPhysicalControls;
    service.getCharacteristic(accessory.Characteristic.LockPhysicalControls)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return status.value ? CONTROL_LOCK_ENABLED : CONTROL_LOCK_DISABLED;
    })
        .onSet(async (value) => {
        await accessory.sendCommands([{
                code: schema.code,
                value: (value === CONTROL_LOCK_ENABLED) ? true : false,
            }], true);
    });
}
//# sourceMappingURL=LockPhysicalControls.js.map