"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureTargetTemperature = configureTargetTemperature;
const util_1 = require("../../util/util");
function configureTargetTemperature(accessory, service, schema) {
    if (!schema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.Thermostat)
            || accessory.accessory.addService(accessory.Service.Thermostat);
    }
    const property = schema.property || {};
    const props = (0, util_1.toHapProperty)(property);
    const multiple = Math.pow(10, property['scale'] || 0);
    service.getCharacteristic(accessory.Characteristic.TargetTemperature)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return (0, util_1.limit)(status.value / multiple, props['minValue'], props['maxValue']);
    })
        .onSet(async (value) => {
        await accessory.sendCommands([{
                code: schema.code,
                value: value * multiple,
            }]);
    })
        .setProps(props);
}
//# sourceMappingURL=TargetTemperature.js.map