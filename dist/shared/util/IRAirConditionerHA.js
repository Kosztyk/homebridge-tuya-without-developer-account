"use strict";
/**
 * Pure helpers for IR air conditioners on the Tuya QR (Home Assistant sharing) cloud.
 *
 * - The IR AC remote (category `infrared_ac`) exposes the write-only functions `PowerOn`,
 *   `PowerOff`, `M` (mode), `T` (temperature) and `F` (fan speed), and reports no state.
 * - IR hubs with a built-in AC thermostat (category `hwktwkq`, e.g. NAS-RT01W6 "Smart AC
 *   Controller") mirror the AC state, room temperature and humidity in local data points.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAN_SPEED = exports.AC_MODE = exports.POWER_ON = exports.POWER_OFF = exports.DEFAULT_TEMP_RANGE = void 0;
exports.buildKeyRange = buildKeyRange;
exports.buildQRCommands = buildQRCommands;
exports.knownStateAfterCommand = knownStateAfterCommand;
exports.statusToState = statusToState;
exports.hubDpsToState = hubDpsToState;
const POWER_OFF = 0;
exports.POWER_OFF = POWER_OFF;
const POWER_ON = 1;
exports.POWER_ON = POWER_ON;
// Values of the QR `M` / `F` functions and of the remote's `mode` / `wind` status.
const AC_MODE = { COOL: 0, HEAT: 1, AUTO: 2, FAN: 3, DEHUMIDIFIER: 4 };
exports.AC_MODE = AC_MODE;
const FAN_SPEED = { AUTO: 0, LOW: 1, MIDDLE: 2, HIGH: 3 };
exports.FAN_SPEED = FAN_SPEED;
const DEFAULT_TEMP_RANGE = [16, 30];
exports.DEFAULT_TEMP_RANGE = DEFAULT_TEMP_RANGE;
const STATE_CODES = ['power', 'mode', 'temp', 'wind'];
// Default data points of a `hwktwkq` IR hub (override with `irAirConditioner.hubDps`).
const DEFAULT_HUB_DPS = {
    power: '1',
    currentTemperature: '2',
    targetTemperature: '3',
    mode: '4',
    fan: '5',
    humidity: '12',
};
const HUB_MODES = {
    cold: AC_MODE.COOL, cool: AC_MODE.COOL,
    warm: AC_MODE.HEAT, hot: AC_MODE.HEAT, heat: AC_MODE.HEAT,
    auto: AC_MODE.AUTO,
    air: AC_MODE.FAN, wind: AC_MODE.FAN, fan: AC_MODE.FAN,
    dehumidify: AC_MODE.DEHUMIDIFIER, wet: AC_MODE.DEHUMIDIFIER, dry: AC_MODE.DEHUMIDIFIER,
};
const HUB_FAN_SPEEDS = {
    auto: FAN_SPEED.AUTO,
    low: FAN_SPEED.LOW,
    middle: FAN_SPEED.MIDDLE, mid: FAN_SPEED.MIDDLE, medium: FAN_SPEED.MIDDLE,
    high: FAN_SPEED.HIGH,
};
/**
 * Build a `remote_keys.key_range` equivalent from the remote's QR specification: modes 0..M.max
 * (at most `maxModeLimit`), temperatures from the `airConditioner` override or the T range.
 */
function buildKeyRange(schema = [], acConfig = {}, maxModeLimit = AC_MODE.DEHUMIDIFIER) {
    const property = (code) => schema.find(item => item.code === code)?.property || {};
    const pick = (...values) => values.find(value => Number.isFinite(value));
    const maxMode = Math.min(pick(property('M').max, AC_MODE.DEHUMIDIFIER), maxModeLimit);
    const min = pick(acConfig?.minTemperature, property('T').min, DEFAULT_TEMP_RANGE[0]);
    const max = pick(acConfig?.maxTemperature, property('T').max, DEFAULT_TEMP_RANGE[1]);
    const temp_list = [];
    for (let temp = min; temp <= max; temp++) {
        temp_list.push({ temp });
    }
    const key_range = [];
    for (let mode = 0; mode <= maxMode; mode++) {
        key_range.push({ mode, temp_list });
    }
    return key_range;
}
/**
 * QR commands that move the AC from the `known` state to the `desired` state. Every function
 * sends a full IR frame (one beep), so only what differs is sent, power first.
 */
function buildQRCommands(desired, known = {}) {
    if (desired.power !== POWER_ON) {
        return known.power === POWER_OFF ? [] : [{ code: 'PowerOff', value: 'PowerOff' }];
    }
    const commands = [];
    if (known.power !== POWER_ON) {
        commands.push({ code: 'PowerOn', value: 'PowerOn' });
    }
    if (desired.mode !== known.mode) {
        commands.push({ code: 'M', value: desired.mode });
    }
    if (desired.temp !== known.temp) {
        commands.push({ code: 'T', value: desired.temp });
    }
    if (desired.wind !== known.wind) {
        commands.push({ code: 'F', value: desired.wind });
    }
    return commands;
}
/** What a successfully sent QR function says about the AC state (M / T / F also power it on). */
function knownStateAfterCommand({ code, value }) {
    switch (code) {
        case 'PowerOn':
            return { power: POWER_ON };
        case 'PowerOff':
            return { power: POWER_OFF };
        case 'M':
            return { power: POWER_ON, mode: value };
        case 'T':
            return { power: POWER_ON, temp: value };
        case 'F':
            return { power: POWER_ON, wind: value };
        default:
            return {};
    }
}
/** AC state from QR cloud status items of the remote (`power`, `mode`, `temp`, `wind`). */
function statusToState(status = []) {
    const state = {};
    for (const { code, value } of status) {
        if (!STATE_CODES.includes(code) || value === undefined || value === null) {
            continue;
        }
        const number = parseInt(String(value));
        if (code === 'power') {
            state.power = (value === true || number === 1) ? POWER_ON : POWER_OFF;
        }
        else if (Number.isFinite(number)) {
            state[code] = number;
        }
    }
    return state;
}
/**
 * AC state (`power`, `mode`, `temp`, `wind`) and sensor readings (`currentTemperature`,
 * `humidity`) from IR hub data points. Only reported, recognised values are returned.
 */
function hubDpsToState(dps, dpMap = {}, currentTemperatureDivisor = 10) {
    const map = { ...DEFAULT_HUB_DPS, ...dpMap };
    const value = (key) => dps[map[key]];
    const number = (key) => (typeof value(key) === 'number' && Number.isFinite(value(key))) ? value(key) : undefined;
    const lookup = (key, table) => (typeof value(key) === 'string') ? table[value(key).toLowerCase()] : undefined;
    const state = {
        power: typeof value('power') === 'boolean' ? (value('power') ? POWER_ON : POWER_OFF) : undefined,
        mode: lookup('mode', HUB_MODES),
        temp: number('targetTemperature'),
        wind: lookup('fan', HUB_FAN_SPEEDS),
        currentTemperature: number('currentTemperature') !== undefined
            ? number('currentTemperature') / (currentTemperatureDivisor || 1)
            : undefined,
        humidity: number('humidity'),
    };
    return Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined));
}
