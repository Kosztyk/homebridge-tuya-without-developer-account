"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureOccupancyDetected = configureOccupancyDetected;
function configureOccupancyDetected(accessory, service, schema) {
    if (!schema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.OccupancySensor)
            || accessory.accessory.addService(accessory.Service.OccupancySensor);
    }
    const { OCCUPANCY_DETECTED, OCCUPANCY_NOT_DETECTED } = accessory.Characteristic.OccupancyDetected;
    service.getCharacteristic(accessory.Characteristic.OccupancyDetected)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return (status.value === 'presence') ? OCCUPANCY_DETECTED : OCCUPANCY_NOT_DETECTED;
    });
}
//# sourceMappingURL=OccupancyDetected.js.map