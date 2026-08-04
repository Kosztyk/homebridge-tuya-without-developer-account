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

    const getCurrentValue = (characteristicType) => {
        try {
            if (service.testCharacteristic(characteristicType)) {
                const value = service.getCharacteristic(characteristicType).value;
                return typeof value === 'string' ? value.trim() : '';
            }
        }
        catch (_error) {
            // Ignore malformed cached values and fall back to the generated name.
        }
        return '';
    };
    const currentConfiguredName = getCurrentValue(accessory.Characteristic.ConfiguredName);
    const currentName = getCurrentValue(accessory.Characteristic.Name);

    let targetName;
    if (forcedName) {
        targetName = forcedName;
    }
    else if (preserveExisting) {
        // Apple Home/Homebridge may persist a user rename either as
        // ConfiguredName or as Name depending on platform/version and service
        // type. Preserve either valid value rather than replacing it on start.
        targetName = toSafeName(currentConfiguredName, undefined)
            || toSafeName(currentName, undefined)
            || generatedName;
    }
    else {
        targetName = generatedName;
    }

    service.updateCharacteristic(accessory.Characteristic.Name, targetName);
    service.updateCharacteristic(accessory.Characteristic.ConfiguredName, targetName);
}
//# sourceMappingURL=Name.js.map
