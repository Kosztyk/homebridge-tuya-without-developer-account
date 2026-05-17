"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureRelativeHumidityDehumidifierThreshold = configureRelativeHumidityDehumidifierThreshold;
const util_1 = require("../../util/util");
function configureRelativeHumidityDehumidifierThreshold(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const property = schema.property;
    const multiple = Math.pow(10, property.scale);
    const props = {
        minValue: 0,
        maxValue: 100,
        minStep: Math.max(1, property.step / multiple),
    };
    accessory.log.debug('Set props for RelativeHumidityDehumidifierThreshold:', props);
    service.getCharacteristic(accessory.Characteristic.RelativeHumidityDehumidifierThreshold)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return (0, util_1.limit)(status.value / multiple, 0, 100);
    })
        .onSet(async (value) => {
        const dehumidity_set = (0, util_1.limit)(value * multiple, property.min, property.max);
        await accessory.sendCommands([{ code: schema.code, value: dehumidity_set }]);
    })
        .setProps(props);
}
//# sourceMappingURL=RelativeHumidityDehumidifierThreshold.js.map