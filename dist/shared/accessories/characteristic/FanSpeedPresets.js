"use strict";
/** Optional per-device HomeKit fan speed presets; 0 remains HomeKit's stop value. */
function normalizeFanSpeedPresets(input) {
    if (!Array.isArray(input) || input.length < 2 || input.length > 20) return undefined;
    if (!input.every(value => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100)) return undefined;
    if (input[input.length - 1] !== 100 || input.some((value, i) => i > 0 && value <= input[i - 1])) return undefined;
    return [...input];
}
function snapFanSpeed(percent, presets) {
    const value = Number(percent);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (!presets?.length) return Math.min(100, value);
    let closest = presets[0];
    for (const preset of presets) {
        // Equidistant candidates choose the higher speed to avoid undershooting.
        if (Math.abs(preset - value) <= Math.abs(closest - value)) closest = preset;
    }
    return closest;
}
function fanPresetMinStep(presets) {
    if (!presets?.length) return 1;
    // HAP minStep can represent only a uniformly spaced 0..100 series.
    const step = presets[0];
    return presets.every((preset, i) => preset === step * (i + 1)) ? step : 1;
}
module.exports = { normalizeFanSpeedPresets, snapFanSpeed, fanPresetMinStep };
