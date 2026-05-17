"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureName = configureName;
const util_1 = require("../../util/util");
function configureName(accessory, service, name) {
    const fallbackName = name.replace(/[^A-Za-z0-9 '\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const safeName = (0, util_1.sanitizeName)(name) ?? (fallbackName || 'Tuya Service');
    service.setCharacteristic(accessory.Characteristic.Name, safeName);
    if (!service.testCharacteristic(accessory.Characteristic.ConfiguredName)) {
        service.addOptionalCharacteristic(accessory.Characteristic.ConfiguredName); // silence warning
    }
    // update every time so cached invalid names get corrected on restart
    service.setCharacteristic(accessory.Characteristic.ConfiguredName, safeName);
}
//# sourceMappingURL=Name.js.map