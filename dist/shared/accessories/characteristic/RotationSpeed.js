"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureRotationSpeed = configureRotationSpeed;
exports.configureRotationSpeedLevel = configureRotationSpeedLevel;
exports.configureRotationSpeedOn = configureRotationSpeedOn;
const util_1 = require("../../util/util");
function configureRotationSpeed(accessory, service, schema) {
    if (!schema) {
        return;
    }
    const property = schema.property;
    const multiple = Math.pow(10, property.scale);
    const props = {
        minValue: property.min / multiple,
        maxValue: property.max / multiple,
        minStep: Math.max(1, property.step / multiple),
    };
    service.getCharacteristic(accessory.Characteristic.RotationSpeed)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        const value = status.value / multiple;
        return (0, util_1.limit)(value, props.minValue, props.maxValue);
    })
        .onSet(async (value) => {
        const speed = value * multiple;
        await accessory.sendCommands([{ code: schema.code, value: speed }], true);
    })
        .setProps(props);
}
function configureRotationSpeedLevel(accessory, service, schema, ignoreValues) {
    if (!schema) {
        return;
    }
    const property = schema.property;
    const range = [];
    for (const value of property.range) {
        if (ignoreValues?.includes(value)) {
            continue;
        }
        range.push(value);
    }
    const props = { minValue: 0, maxValue: range.length, minStep: 1, unit: 'speed' };
    accessory.log.debug('Set props for RotationSpeed:', props);
    const onGetHandler = () => {
        const status = accessory.getStatus(schema.code);
        const index = range.indexOf(status.value);
        return (0, util_1.limit)(index + 1, props.minValue, props.maxValue);
    };
    service.getCharacteristic(accessory.Characteristic.RotationSpeed)
        .onGet(onGetHandler)
        .onSet(async (value) => {
        accessory.log.debug('Set RotationSpeed to:', value);
        const index = Math.round(value - 1);
        if (index < 0 || index >= range.length) {
            accessory.log.debug('Out of range, return.');
            return;
        }
        const speedLevel = range[index].toString();
        accessory.log.debug('Set RotationSpeedLevel to:', speedLevel);
        await accessory.sendCommands([{ code: schema.code, value: speedLevel }], true);
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