"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureSwingMode = configureSwingMode;
function configureSwingMode(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const { SWING_DISABLED, SWING_ENABLED } = accessory.Characteristic.SwingMode;
    service.getCharacteristic(accessory.Characteristic.SwingMode)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return status.value ? SWING_ENABLED : SWING_DISABLED;
    })
        .onSet(async (value) => {
        await accessory.sendCommands([{
                code: schema.code,
                value: (value === SWING_ENABLED) ? true : false,
            }], true);
    });
}
//# sourceMappingURL=SwingMode.js.map