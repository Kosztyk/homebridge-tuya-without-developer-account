"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureLightSensor = configureLightSensor;
const util_1 = require("../../util/util");
function configureLightSensor(accessory, service, schema) {
    if (!schema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.LightSensor)
            || accessory.accessory.addService(accessory.Service.LightSensor);
    }
    const property = schema.property || {};
    const props = (0, util_1.toHapProperty)(property);
    const multiple = Math.pow(10, property['scale'] || 0);
    service.getCharacteristic(accessory.Characteristic.CurrentAmbientLightLevel)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return (0, util_1.limit)(status.value / multiple, props['minValue'], props['maxValue']);
    })
        .setProps(props);
}
//# sourceMappingURL=LightSensor.js.map