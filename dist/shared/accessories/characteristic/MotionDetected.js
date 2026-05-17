"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureMotionDetected = configureMotionDetected;
const TuyaDevice_1 = require("../../../cloud/device/TuyaDevice");
function configureMotionDetected(accessory, service, schema) {
    if (!schema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.MotionSensor)
            || accessory.accessory.addService(accessory.Service.MotionSensor);
    }
    service.getCharacteristic(accessory.Characteristic.MotionDetected)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        if (schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Enum) { // pir
            return (status.value === 'pir');
        }
        return false;
    });
}
//# sourceMappingURL=MotionDetected.js.map