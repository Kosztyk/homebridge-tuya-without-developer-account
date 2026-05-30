"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureLight = configureLight;
const color_1 = require("../../util/color");
const util_1 = require("../../util/util");
const On_1 = require("./On");
const DEFAULT_COLOR_TEMPERATURE_KELVIN = 6500;
var LightType;
(function (LightType) {
    LightType["Unknown"] = "Unknown";
    LightType["Normal"] = "Normal";
    LightType["C"] = "C";
    LightType["CW"] = "CW";
    LightType["RGB"] = "RGB";
    LightType["RGBC"] = "RGBC";
    LightType["RGBCW"] = "RGBCW";
})(LightType || (LightType = {}));
function getLightType(accessory, on, bright, temp, color, mode) {
    const modeRange = mode && mode.property.range;
    const { h, s, v } = (color?.property || {});
    let lightType;
    if (on && bright && temp && h && s && v && modeRange && modeRange.includes('colour') && modeRange.includes('white')) {
        lightType = LightType.RGBCW;
    }
    else if (on && bright && !temp && h && s && v && modeRange && modeRange.includes('colour') && modeRange.includes('white')) {
        lightType = LightType.RGBC;
    }
    else if (on && !temp && h && s && v) {
        lightType = LightType.RGB;
    }
    else if (on && bright && temp) {
        lightType = LightType.CW;
    }
    else if (on && bright && !temp) {
        lightType = LightType.C;
    }
    else if (on && !bright && !temp) {
        lightType = LightType.Normal;
    }
    else {
        lightType = LightType.Unknown;
    }
    return lightType;
}
function getColorValue(accessory, schema) {
    const status = accessory.getStatus(schema.code);
    if (!status || !status.value || status.value === '' || status.value === '{}') {
        return { h: 0, s: 0, v: 0 };
    }
    const { h, s, v } = JSON.parse(status.value);
    return {
        h: h,
        s: s,
        v: v,
    };
}
function inWhiteMode(accessory, lightType, modeSchema) {
    if (lightType === LightType.C || lightType === LightType.CW) {
        return true;
    }
    else if (lightType === LightType.RGB) {
        return false;
    }
    if (!modeSchema) {
        return false;
    }
    const status = accessory.getStatus(modeSchema.code);
    return (status.value === 'white');
}
function inColorMode(accessory, lightType, modeSchema) {
    if (lightType === LightType.RGB) {
        return true;
    }
    else if (lightType === LightType.C || lightType === LightType.CW) {
        return false;
    }
    if (!modeSchema) {
        return false;
    }
    const status = accessory.getStatus(modeSchema.code);
    return (status.value === 'colour');
}
function configureBrightness(accessory, service, lightType, brightSchema, colorSchema, modeSchema) {
    service.getCharacteristic(accessory.Characteristic.Brightness)
        .onGet(() => {
        if (inColorMode(accessory, lightType, modeSchema) && colorSchema) {
            // Color mode, get brightness from `color_data.v`
            const { max } = colorSchema.property.v;
            const colorValue = getColorValue(accessory, colorSchema);
            const value = Math.round(100 * colorValue.v / max);
            return (0, util_1.limit)(value, 0, 100);
        }
        else if (inWhiteMode(accessory, lightType, modeSchema) && brightSchema) {
            // White mode, get brightness from `brightness_value`
            const { max } = brightSchema.property;
            const status = accessory.getStatus(brightSchema.code);
            const value = Math.round(100 * status.value / max);
            return (0, util_1.limit)(value, 0, 100);
        }
        else {
            // Unsupported mode
            return 100;
        }
    })
        .onSet(async (value) => {
        accessory.log.debug(`Characteristic.Brightness set to: ${value}`);
        if (inColorMode(accessory, lightType, modeSchema) && colorSchema) {
            // Color mode, set brightness to `color_data.v`
            const { min, max } = colorSchema.property.v;
            const colorValue = getColorValue(accessory, colorSchema);
            colorValue.v = Math.round(value * max / 100);
            colorValue.v = (0, util_1.limit)(colorValue.v, min, max);
            await accessory.sendCommands([{ code: colorSchema.code, value: JSON.stringify(colorValue) }], true);
        }
        else if (inWhiteMode(accessory, lightType, modeSchema) && brightSchema) {
            // White mode, set brightness to `brightness_value`
            const { min, max } = brightSchema.property;
            let brightValue = Math.round(value * max / 100);
            brightValue = (0, util_1.limit)(brightValue, min, max);
            await accessory.sendCommands([{ code: brightSchema.code, value: brightValue }], true);
        }
        else {
            // Unsupported mode
            accessory.log.warn('Neither color mode nor white mode.');
        }
    });
}
function configureColourTemperature(accessory, service, lightType, tempSchema, modeSchema) {
    const props = { minValue: 140, maxValue: 500, minStep: 1 };
    if (lightType === LightType.RGBC) {
        props.minValue = props.maxValue = Math.round((0, color_1.kelvinToMired)(DEFAULT_COLOR_TEMPERATURE_KELVIN));
    }
    accessory.log.debug('Set props for ColorTemperature:', props);
    service.getCharacteristic(accessory.Characteristic.ColorTemperature)
        .onGet(() => {
        if (lightType === LightType.RGBC) {
            return props.minValue;
        }
        // const schema = accessory.getSchema(...SCHEMA_CODE.COLOR_TEMP)!;
        const { min, max } = tempSchema.property;
        const status = accessory.getStatus(tempSchema.code);
        const kelvin = (0, util_1.remap)(status.value, min, max, (0, color_1.miredToKelvin)(props.maxValue), (0, color_1.miredToKelvin)(props.minValue));
        const mired = Math.round((0, color_1.kelvinToMired)(kelvin));
        return (0, util_1.limit)(mired, props.minValue, props.maxValue);
    })
        .onSet(async (value) => {
        accessory.log.debug(`Characteristic.ColorTemperature set to: ${value}`);
        const commands = [];
        if (modeSchema) {
            commands.push({ code: modeSchema.code, value: 'white' });
        }
        if (lightType !== LightType.RGBC) {
            const { min, max } = tempSchema.property;
            const kelvin = (0, color_1.miredToKelvin)(value);
            const temp = Math.round((0, util_1.remap)(kelvin, (0, color_1.miredToKelvin)(props.maxValue), (0, color_1.miredToKelvin)(props.minValue), min, max));
            commands.push({ code: tempSchema.code, value: temp });
        }
        await accessory.sendCommands(commands, true);
    })
        .setProps(props);
}
function configureHue(accessory, service, lightType, colorSchema, modeSchema) {
    const { min, max } = colorSchema.property.h;
    service.getCharacteristic(accessory.Characteristic.Hue)
        .onGet(() => {
        if (inWhiteMode(accessory, lightType, modeSchema)) {
            return (0, color_1.kelvinToHSV)(DEFAULT_COLOR_TEMPERATURE_KELVIN).h;
        }
        const hue = Math.round(360 * getColorValue(accessory, colorSchema).h / max);
        return (0, util_1.limit)(hue, 0, 360);
    })
        .onSet(async (value) => {
        accessory.log.debug(`Characteristic.Hue set to: ${value}`);
        const colorValue = getColorValue(accessory, colorSchema);
        colorValue.h = Math.round(value * max / 360);
        colorValue.h = (0, util_1.limit)(colorValue.h, min, max);
        const commands = [{
                code: colorSchema.code,
                value: JSON.stringify(colorValue),
            }];
        if (modeSchema) {
            commands.push({ code: modeSchema.code, value: 'colour' });
        }
        await accessory.sendCommands(commands, true);
    });
}
function configureSaturation(accessory, service, lightType, colorSchema, modeSchema) {
    const { min, max } = colorSchema.property.s;
    service.getCharacteristic(accessory.Characteristic.Saturation)
        .onGet(() => {
        if (inWhiteMode(accessory, lightType, modeSchema)) {
            return (0, color_1.kelvinToHSV)(DEFAULT_COLOR_TEMPERATURE_KELVIN).s;
        }
        const saturation = Math.round(100 * getColorValue(accessory, colorSchema).s / max);
        return (0, util_1.limit)(saturation, 0, 100);
    })
        .onSet(async (value) => {
        accessory.log.debug(`Characteristic.Saturation set to: ${value}`);
        const colorValue = getColorValue(accessory, colorSchema);
        colorValue.s = Math.round(value * max / 100);
        colorValue.s = (0, util_1.limit)(colorValue.s, min, max);
        const commands = [{
                code: colorSchema.code,
                value: JSON.stringify(colorValue),
            }];
        if (modeSchema) {
            commands.push({ code: modeSchema.code, value: 'colour' });
        }
        await accessory.sendCommands(commands, true);
    });
}
function configureLight(accessory, service, onSchema, brightSchema, tempSchema, colorSchema, modeSchema) {
    if (!onSchema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.Lightbulb)
            || accessory.accessory.addService(accessory.Service.Lightbulb, accessory.accessory.displayName + ' Light');
    }
    const lightType = getLightType(accessory, onSchema, brightSchema, tempSchema, colorSchema, modeSchema);
    accessory.log.info('Light type:', lightType);
    switch (lightType) {
        case LightType.Normal:
            (0, On_1.configureOn)(accessory, service, onSchema);
            break;
        case LightType.C:
            (0, On_1.configureOn)(accessory, service, onSchema);
            configureBrightness(accessory, service, lightType, brightSchema, colorSchema, modeSchema);
            break;
        case LightType.CW:
            (0, On_1.configureOn)(accessory, service, onSchema);
            configureBrightness(accessory, service, lightType, brightSchema, colorSchema, modeSchema);
            configureColourTemperature(accessory, service, lightType, tempSchema, modeSchema);
            break;
        case LightType.RGB:
            (0, On_1.configureOn)(accessory, service, onSchema);
            configureBrightness(accessory, service, lightType, brightSchema, colorSchema, modeSchema);
            configureHue(accessory, service, lightType, colorSchema, modeSchema);
            configureSaturation(accessory, service, lightType, colorSchema, modeSchema);
            break;
        case LightType.RGBC:
        case LightType.RGBCW:
            (0, On_1.configureOn)(accessory, service, onSchema);
            configureBrightness(accessory, service, lightType, brightSchema, colorSchema, modeSchema);
            configureColourTemperature(accessory, service, lightType, tempSchema, modeSchema);
            configureHue(accessory, service, lightType, colorSchema, modeSchema);
            configureSaturation(accessory, service, lightType, colorSchema, modeSchema);
            break;
    }
    configureAdaptiveLighting(accessory, service, brightSchema, tempSchema);
}
function getAdaptiveLightingOverride(config) {
    if (!config || config.adaptiveLighting === undefined) {
        return undefined;
    }
    if (typeof config.adaptiveLighting === 'boolean') {
        return config.adaptiveLighting;
    }
    if (config.adaptiveLighting && typeof config.adaptiveLighting === 'object' && typeof config.adaptiveLighting.enabled === 'boolean') {
        return config.adaptiveLighting.enabled;
    }
    return undefined;
}
function shouldEnableAdaptiveLighting(accessory) {
    const config = accessory.platform.getDeviceConfig(accessory.device);
    const override = getAdaptiveLightingOverride(config);
    if (override !== undefined) {
        return override;
    }
    return accessory.platform.options.enableAdaptiveLighting === true;
}
function configureAdaptiveLighting(accessory, service, brightSchema, tempSchema) {
    if (!shouldEnableAdaptiveLighting(accessory)) {
        accessory.log.info('Adaptive Lighting disabled.');
        return;
    }
    if (!brightSchema || !tempSchema) {
        accessory.log.info('Adaptive Lighting skipped: this light does not expose both brightness and a real color-temperature DP.');
        return;
    }
    if (!service.testCharacteristic(accessory.Characteristic.Brightness) || !service.testCharacteristic(accessory.Characteristic.ColorTemperature)) {
        accessory.log.info('Adaptive Lighting skipped: HomeKit Lightbulb service is missing Brightness or ColorTemperature.');
        return;
    }
    const { AdaptiveLightingController } = accessory.platform.api.hap;
    if (!AdaptiveLightingController) {
        accessory.log.warn('Adaptive Lighting skipped: this Homebridge/HAP-NodeJS version does not expose AdaptiveLightingController.');
        return;
    }
    try {
        const controller = new AdaptiveLightingController(service);
        accessory.accessory.configureController(controller);
        accessory.adaptiveLightingController = controller;
        accessory.log.info('Adaptive Lighting enabled for eligible CCT/RGBCW light.');
    }
    catch (error) {
        accessory.log.warn(`Adaptive Lighting setup failed: ${error instanceof Error ? error.message : error}`);
    }
}

//# sourceMappingURL=Light.js.map