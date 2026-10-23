"use strict";
// Pure QR IR-air-conditioner conversions. No network access or HomeKit side effects.
const POWER_OFF = 0, POWER_ON = 1;
const AC_MODE = Object.freeze({ COOL: 0, HEAT: 1, AUTO: 2, FAN: 3, DEHUMIDIFIER: 4 });
const FAN_SPEED = Object.freeze({ AUTO: 0, LOW: 1, MIDDLE: 2, HIGH: 3 });
const DEFAULT_TEMP_RANGE = [16, 30];
const DEFAULT_HUB_DPS = Object.freeze({ power: '1', currentTemperature: '2', targetTemperature: '3', mode: '4', fan: '5', humidity: '12' });
const HUB_MODES = { cold: 0, cool: 0, warm: 1, hot: 1, heat: 1, auto: 2, air: 3, wind: 3, fan: 3, dehumidify: 4, wet: 4, dry: 4 };
const HUB_FANS = { auto: 0, low: 1, middle: 2, mid: 2, medium: 2, high: 3 };
function finiteNumber(value) { if (value === null || value === undefined || value === '') return undefined; const n = Number(value); return Number.isFinite(n) ? n : undefined; }
function schemaProperty(schema, code) {
  let property = (Array.isArray(schema) ? schema : []).find(x => x?.code === code)?.property ?? {};
  if (typeof property === 'string') { try { property = JSON.parse(property); } catch { property = {}; } }
  return property && typeof property === 'object' ? property : {};
}
function buildKeyRange(schema = [], acConfig = {}, maxModeLimit = AC_MODE.DEHUMIDIFIER) {
  const mode = schemaProperty(schema, 'M');
  const temp = schemaProperty(schema, 'T');
  const maxMode = Math.max(0, Math.min(AC_MODE.DEHUMIDIFIER, maxModeLimit, finiteNumber(mode.max) ?? 4));
  // User overrides may narrow, but should never expand, the supported hardware range.
  const hwMin = finiteNumber(temp.min) ?? DEFAULT_TEMP_RANGE[0];
  const hwMax = finiteNumber(temp.max) ?? DEFAULT_TEMP_RANGE[1];
  const min = Math.max(hwMin, finiteNumber(acConfig.minTemperature) ?? hwMin);
  const max = Math.min(hwMax, finiteNumber(acConfig.maxTemperature) ?? hwMax);
  const step = Math.max(1, finiteNumber(temp.step) ?? 1);
  if (max < min) return [];
  const temp_list = [];
  for (let n = min; n <= max && temp_list.length < 100; n += step) temp_list.push({ temp: n });
  return Array.from({ length: maxMode + 1 }, (_, mode) => ({ mode, temp_list: temp_list.map(t => ({ ...t })) }));
}
function buildQRCommands(desired, known = {}) {
  if (desired.power !== POWER_ON) return known.power === POWER_OFF ? [] : [{ code: 'PowerOff', value: 'PowerOff' }];
  const result = [];
  if (known.power !== POWER_ON) result.push({ code: 'PowerOn', value: 'PowerOn' });
  for (const [field, code] of [['mode','M'], ['temp','T'], ['wind','F']]) {
    if (desired[field] !== undefined && desired[field] !== known[field]) result.push({ code, value: desired[field] });
  }
  return result;
}
function knownStateAfterCommand({ code, value }) {
  switch (code) {
    case 'PowerOn': return { power: POWER_ON };
    case 'PowerOff': return { power: POWER_OFF };
    case 'M': return { power: POWER_ON, mode: value };
    case 'T': return { power: POWER_ON, temp: value };
    case 'F': return { power: POWER_ON, wind: value };
    default: return {};
  }
}
function statusToState(status = []) {
  const result = {};
  for (const item of Array.isArray(status) ? status : []) {
    if (!['power','mode','temp','wind'].includes(item?.code) || item.value === undefined || item.value === null) continue;
    const n = finiteNumber(item.value);
    if (item.code === 'power') result.power = item.value === true || n === 1 ? POWER_ON : POWER_OFF;
    else if (n !== undefined) result[item.code] = n;
  }
  return result;
}
function hubDpsToState(dps = {}, dpMap = {}, divisor = 10) {
  const map = { ...DEFAULT_HUB_DPS, ...(dpMap || {}) };
  const value = key => dps?.[map[key]];
  const number = key => finiteNumber(value(key));
  const lookup = (key, table) => typeof value(key) === 'string' ? table[value(key).toLowerCase()] : undefined;
  const powerValue = value('power');
  const power = typeof powerValue === 'boolean' ? (powerValue ? POWER_ON : POWER_OFF) : undefined;
  const current = number('currentTemperature');
  const result = { power, mode: lookup('mode', HUB_MODES), temp: number('targetTemperature'), wind: lookup('fan', HUB_FANS), currentTemperature: current === undefined ? undefined : current / (finiteNumber(divisor) || 10), humidity: number('humidity') };
  return Object.fromEntries(Object.entries(result).filter(([,v]) => v !== undefined));
}
module.exports = { POWER_OFF, POWER_ON, AC_MODE, FAN_SPEED, DEFAULT_TEMP_RANGE, DEFAULT_HUB_DPS, buildKeyRange, buildQRCommands, knownStateAfterCommand, statusToState, hubDpsToState };
