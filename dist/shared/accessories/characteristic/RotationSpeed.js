"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureRotationSpeed = configureRotationSpeed;
exports.configureRotationSpeedLevel = configureRotationSpeedLevel;
exports.configureRotationSpeedOn = configureRotationSpeedOn;
const util_1 = require("../../util/util");
const { normalizeFanSpeedPresets, snapFanSpeed, fanPresetMinStep } = require("./FanSpeedPresets");
function configureRotationSpeed(accessory, service, schema, configuredPresets) {
    if (!schema) {
        return;
    }
    const presets = normalizeFanSpeedPresets(configuredPresets);
    const property = schema.property || {};
    const multiple = Math.pow(10, property.scale || 0);
    const rawMin = Number(property.min);
    const rawMax = Number(property.max);
    const rawStep = Math.max(Number(property.step) || 1, 1);
    const isPercentSchema = String(schema.code || '').toLowerCase().includes('percent');
    // `fan_speed` is commonly a discrete Tuya level (for example 1..6), while
    // HomeKit RotationSpeed is a percentage characteristic. Exposing Tuya's
    // raw 1..6 range directly makes Apple Home show 1%, 2%, ... and treats the
    // final level inconsistently. Translate discrete levels to the full
    // HomeKit 0..100% range instead. Keep explicitly percentage-based Tuya
    // schemas (for example fan_speed_percent) on their native percentage scale.
    if (!isPercentSchema && Number.isFinite(rawMin) && Number.isFinite(rawMax) && rawMax >= rawMin) {
        const levelCount = Math.max(1, Math.floor((rawMax - rawMin) / rawStep) + 1);
        const props = {
            minValue: 0,
            maxValue: 100,
            // Expose the physical number of fan levels instead of a 100-step
            // slider. For six speeds this is 16.666...%, which Apple Home
            // renders as approximately 17/33/50/67/83/100%.
            minStep: presets ? fanPresetMinStep(presets) : 100 / levelCount,
        };
        const rawToPercent = (rawValue) => {
            const raw = Number(rawValue);
            if (!Number.isFinite(raw)) {
                return 0;
            }
            const clampedRaw = (0, util_1.limit)(raw, rawMin, rawMax);
            const levelIndex = Math.round((clampedRaw - rawMin) / rawStep) + 1;
            const physicalPercent = (0, util_1.limit)(Math.round(levelIndex * 100 / levelCount), 1, 100);
            return presets ? snapFanSpeed(physicalPercent, presets) : physicalPercent;
        };
        const percentToRaw = (percentValue) => {
            const percent = presets ? snapFanSpeed(percentValue, presets) : (0, util_1.limit)(Number(percentValue) || 0, 0, 100);
            // RotationSpeed=0 is HomeKit's stopped value. The fan's actual
            // on/off state is handled separately, so a non-zero request maps
            // to one of the Tuya speed levels.
            if (percent <= 0) {
                return rawMin;
            }
            const levelIndex = (0, util_1.limit)(Math.round(percent * levelCount / 100), 1, levelCount);
            const raw = rawMin + (levelIndex - 1) * rawStep;
            return (0, util_1.limit)(raw, rawMin, rawMax);
        };
        accessory.log.debug(`Set discrete RotationSpeed mapping for ${schema.code}: ${rawMin}..${rawMax} step ${rawStep} (${levelCount} levels) -> HomeKit 0..100%`);
        const characteristic = service.getCharacteristic(accessory.Characteristic.RotationSpeed)
            .onGet(() => {
            const status = accessory.getStatus(schema.code);
            return rawToPercent(status?.value);
        })
            .onSet(async (value) => {
            const speed = percentToRaw(value);
            accessory.log.debug(`Map HomeKit RotationSpeed ${value}% -> ${schema.code}=${speed}`);
            await accessory.sendCommands([{ code: schema.code, value: speed }], true);
            if (presets) characteristic.updateValue(snapFanSpeed(value, presets));
        });
        characteristic.setProps(props);
        // HomeKit may have cached the old Tuya 1..6 metadata from versions
        // before the percentage migration. Seed a valid percentage value on
        // the newly migrated fan service immediately.
        const currentStatus = accessory.getStatus(schema.code);
        characteristic.updateValue(rawToPercent(currentStatus?.value));
        return;
    }
    const props = {
        minValue: rawMin / multiple,
        maxValue: rawMax / multiple,
        minStep: presets ? fanPresetMinStep(presets) : Math.max(1, rawStep / multiple),
    };
    if (presets) {
        // Native percentage schemas may use scaled raw units and non-unit raw steps.
        // Expose user-defined 0..100% intervals, but never write unsupported raw steps.
        props.minValue = 0;
        props.maxValue = 100;
    }
    const characteristic = service.getCharacteristic(accessory.Characteristic.RotationSpeed)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        if (!status) return 0;
        const value = (0, util_1.limit)(Number(status.value) / multiple, presets ? 0 : props.minValue, presets ? 100 : props.maxValue);
        return presets ? snapFanSpeed(value, presets) : value;
    })
        .onSet(async (value) => {
        const target = presets ? snapFanSpeed(value, presets) : value;
        const rawValue = target * multiple;
        const speed = presets
            ? (0, util_1.limit)(rawMin + Math.round((rawValue - rawMin) / rawStep) * rawStep, rawMin, rawMax)
            : rawValue;
        await accessory.sendCommands([{ code: schema.code, value: speed }], true);
        if (presets) characteristic.updateValue(snapFanSpeed(speed / multiple, presets));
    })
        .setProps(props);
    if (presets) {
        const status = accessory.getStatus(schema.code);
        characteristic.updateValue(status ? snapFanSpeed(Number(status.value) / multiple, presets) : 0);
    }
}
function configureRotationSpeedLevel(accessory, service, schema, ignoreValues, configuredPresets) {
    if (!schema) {
        return;
    }
    const presets = normalizeFanSpeedPresets(configuredPresets);
    const property = schema.property;
    const range = [];
    for (const value of property.range) {
        if (ignoreValues?.includes(value)) {
            continue;
        }
        range.push(value);
    }
    const props = presets
        ? { minValue: 0, maxValue: 100, minStep: fanPresetMinStep(presets) }
        : { minValue: 0, maxValue: range.length, minStep: 1, unit: 'speed' };
    accessory.log.debug('Set props for RotationSpeed:', props);
    const onGetHandler = () => {
        const status = accessory.getStatus(schema.code);
        const index = range.indexOf(status.value);
        const physical = (0, util_1.limit)(index + 1, 0, range.length);
        return presets && physical > 0 ? snapFanSpeed(Math.round(physical * 100 / range.length), presets) : physical;
    };
    const characteristic = service.getCharacteristic(accessory.Characteristic.RotationSpeed)
        .onGet(onGetHandler)
        .onSet(async (value) => {
        accessory.log.debug('Set RotationSpeed to:', value);
        const snapped = presets ? snapFanSpeed(value, presets) : value;
        const index = presets ? Math.max(0, Math.min(range.length - 1, Math.round(snapped * range.length / 100) - 1)) : Math.round(value - 1);
        if (index < 0 || index >= range.length) {
            accessory.log.debug('Out of range, return.');
            return;
        }
        const speedLevel = range[index].toString();
        accessory.log.debug('Set RotationSpeedLevel to:', speedLevel);
        await accessory.sendCommands([{ code: schema.code, value: speedLevel }], true);
        if (presets) characteristic.updateValue(snapFanSpeed(Math.round((index + 1) * 100 / range.length), presets));
    })
        .updateValue(onGetHandler()) // ensure the value is correct before set props
        .setProps(props);
}
function configureRotationSpeedOn(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const props = { minValue: 0, maxValue: 100, minStep: 100 };
    accessory.log.debug('Set props for RotationSpeed:', props);
    service.getCharacteristic(accessory.Characteristic.RotationSpeed)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        return status.value ? 100 : 0;
    })
        .setProps(props);
}
//# sourceMappingURL=RotationSpeed.js.map