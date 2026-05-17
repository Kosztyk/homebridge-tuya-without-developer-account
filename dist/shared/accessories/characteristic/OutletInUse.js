"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureOutletInUse = configureOutletInUse;
function configureOutletInUse(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const test = accessory.getStatus(schema.code)?.value;
    service?.getCharacteristic(accessory.Characteristic.OutletInUse)
        .onGet(() => {
        return test ? true : false;
    });
}
//# sourceMappingURL=OutletInUse.js.map