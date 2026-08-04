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
function normalizeNameForCompare(name) {
    return String(name ?? '')
        .toLowerCase()
        .replace(/[_\-]+/g, ' ')
        .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function getSubtypeSuffix(subtype) {
    const raw = String(subtype ?? '').trim();
    if (!raw) {
        return '';
    }
    const match = raw.match(/(?:switch|control|scene|relay|outlet|plug|usb)[_\s-]*(\d+|usb\d+)$/i);
    return match ? String(match[1]).toLowerCase() : '';
}
function looksLikePluginGeneratedName(candidate, generatedName, accessory, service) {
    const safeCandidate = toSafeName(candidate, undefined);
    if (!safeCandidate) {
        return true;
    }
    const normalized = normalizeNameForCompare(safeCandidate);
    const generated = normalizeNameForCompare(generatedName);
    const deviceName = normalizeNameForCompare(accessory?.device?.name || accessory?.accessory?.displayName || '');
    const subtype = normalizeNameForCompare(service?.subtype || '');
    const suffix = getSubtypeSuffix(service?.subtype);
    const generatedWithoutDevice = deviceName && normalized === normalizeNameForCompare(String(safeCandidate).replace(new RegExp(`^${escapeRegExp(deviceName)}\\s+`, 'i'), ''));
    if (!normalized) {
        return true;
    }
    if (generated && normalized === generated) {
        return true;
    }
    if (subtype && normalized === subtype) {
        return true;
    }
    if (suffix && normalized === suffix) {
        return true;
    }
    if (suffix && normalized === `switch ${suffix}`) {
        return true;
    }
    if (suffix && normalized === `outlet ${suffix}`) {
        return true;
    }
    if (suffix && normalized === `plug ${suffix}`) {
        return true;
    }
    if (suffix && deviceName && normalized === `${deviceName} ${suffix}`) {
        return true;
    }
    if (generatedWithoutDevice) {
        return true;
    }
    return false;
}
function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getServiceDisplayName(service) {
    const value = service?.displayName;
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * Configure a HomeKit service name without overwriting user-renamed services.
 *
 * Homebridge and Apple Home can persist service names in different places:
 * Service.displayName, Service.Name, or Service.ConfiguredName. Multi-gang
 * switches/outlets are especially sensitive because Homebridge can show edited
 * names while Apple Home still sees old generated channel names like 1/2/3.
 *
 * Priority:
 *   1. Explicit override supplied by the plugin configuration.
 *   2. Existing non-generated ConfiguredName / Name / displayName.
 *   3. Existing displayName even when ConfiguredName only contains 1/2/3.
 *   4. Plugin-generated default name.
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
            // Ignore malformed cached values and fall back below.
        }
        return '';
    };
    const currentConfiguredName = getCurrentValue(accessory.Characteristic.ConfiguredName);
    const currentName = getCurrentValue(accessory.Characteristic.Name);
    const displayName = getServiceDisplayName(service);

    let targetName;
    if (forcedName) {
        targetName = forcedName;
    }
    else if (preserveExisting) {
        const candidates = [currentConfiguredName, currentName, displayName];
        for (const candidate of candidates) {
            const safe = toSafeName(candidate, undefined);
            if (safe && !looksLikePluginGeneratedName(safe, generatedName, accessory, service)) {
                targetName = safe;
                break;
            }
        }
        // If HomeKit characteristics only have generated values like 1/2/3 but
        // Homebridge's cached service displayName was edited by the user, use it
        // as the authoritative service name and write it back to HomeKit.
        if (!targetName) {
            const safeDisplayName = toSafeName(displayName, undefined);
            if (safeDisplayName && displayName !== generatedName) {
                targetName = safeDisplayName;
            }
        }
        targetName = targetName || generatedName;
    }
    else {
        targetName = generatedName;
    }

    service.updateCharacteristic(accessory.Characteristic.Name, targetName);
    service.updateCharacteristic(accessory.Characteristic.ConfiguredName, targetName);
}
//# sourceMappingURL=Name.js.map
