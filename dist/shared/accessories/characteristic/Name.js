"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureName = configureName;
const util_1 = require("../../util/util");

function toSafeName(name, fallback = 'Tuya Service') {
    const raw = String(name ?? '');
    const asciiFallback = raw
        .replace(/[^A-Za-z0-9 '\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (0, util_1.sanitizeName)(raw) ?? (asciiFallback || fallback);
}

function getPreserveHomeKitNames(accessory) {
    const globalSetting = accessory?.platform?.options?.preserveHomeKitNames !== false;
    const device = accessory?.device;
    const deviceConfig = device && typeof accessory?.platform?.getDeviceConfig === 'function'
        ? accessory.platform.getDeviceConfig(device)
        : undefined;
    if (typeof deviceConfig?.preserveHomeKitNames === 'boolean') {
        return deviceConfig.preserveHomeKitNames;
    }
    return globalSetting;
}

/**
 * Configure a HomeKit service name without overwriting a user-renamed
 * ConfiguredName on every Homebridge restart.
 *
 * Priority:
 *   1. Explicit override supplied by the plugin configuration.
 *   2. Existing HomeKit ConfiguredName when preservation is enabled.
 *   3. Plugin-generated default name.
 */
function configureName(accessory, service, name, options = {}) {
    const explicitOverride = typeof options.overrideName === 'string' && options.overrideName.trim()
        ? options.overrideName.trim()
        : undefined;
    const generatedName = toSafeName(name);
    const forcedName = explicitOverride ? toSafeName(explicitOverride, generatedName) : undefined;
    const preserveExisting = options.preserveExisting ?? getPreserveHomeKitNames(accessory);

    const hadConfiguredName = service.testCharacteristic(accessory.Characteristic.ConfiguredName);
    if (!hadConfiguredName) {
        service.addOptionalCharacteristic(accessory.Characteristic.ConfiguredName);
    }

    const configuredCharacteristic = service.getCharacteristic(accessory.Characteristic.ConfiguredName);
    const currentConfiguredName = hadConfiguredName && typeof configuredCharacteristic.value === 'string'
        ? configuredCharacteristic.value.trim()
        : '';

    let targetName;
    if (forcedName) {
        targetName = forcedName;
    }
    else if (preserveExisting && currentConfiguredName) {
        // Preserve names changed by the user in Apple Home/Homebridge. If an
        // older cached name is invalid, correct it once rather than reverting
        // to the generated default.
        targetName = toSafeName(currentConfiguredName, generatedName);
    }
    else {
        targetName = generatedName;
    }

    service.updateCharacteristic(accessory.Characteristic.Name, targetName);
    service.updateCharacteristic(accessory.Characteristic.ConfiguredName, targetName);
}
//# sourceMappingURL=Name.js.map
