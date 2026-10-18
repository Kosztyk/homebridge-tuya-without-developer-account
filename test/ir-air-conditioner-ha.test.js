"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  AC_MODE, FAN_SPEED, POWER_OFF, POWER_ON,
  buildKeyRange, buildQRCommands, knownStateAfterCommand, statusToState, hubDpsToState,
} = require('../dist/shared/util/IRAirConditionerHA');

// QR specification of an `infrared_ac` remote (functions F/M/T/PowerOn/PowerOff).
const QR_SCHEMA = [
  { code: 'F', property: { min: 0, max: 3, scale: 0, step: 1, type: 'Integer' } },
  { code: 'M', property: { min: 0, max: 4, scale: 0, step: 1, type: 'Integer' } },
  { code: 'PowerOff', property: 'PowerOff' },
  { code: 'PowerOn', property: 'PowerOn' },
  { code: 'T', property: { min: 16, max: 30, scale: 0, step: 1, type: 'Integer' } },
];
const temps = keyRangeItem => keyRangeItem.temp_list.map(item => item.temp);

test('key range: modes and temperatures come from the QR specification', () => {
  const keyRange = buildKeyRange(QR_SCHEMA);
  assert.deepEqual(keyRange.map(item => item.mode), [0, 1, 2, 3, 4]);
  assert.deepEqual([temps(keyRange[0])[0], temps(keyRange[0]).at(-1)], [16, 30]);
});

test('key range: airConditioner override narrows the temperature range', () => {
  const range = temps(buildKeyRange(QR_SCHEMA, { minTemperature: 17, maxTemperature: 30 })[0]);
  assert.deepEqual([range[0], range.length], [17, 14]);
});

test('key range: dry and fan modes can be left out', () => {
  assert.deepEqual(buildKeyRange(QR_SCHEMA, {}, AC_MODE.AUTO).map(item => item.mode), [0, 1, 2]);
});

test('key range: missing specification falls back to all modes and 16-30 °C', () => {
  const keyRange = buildKeyRange([]);
  assert.equal(keyRange.length, 5);
  assert.equal(temps(keyRange[4]).length, 15);
});

test('commands: turning on from off sends PowerOn plus every changed setting', () => {
  const known = { power: POWER_OFF, mode: AC_MODE.COOL, temp: 23, wind: FAN_SPEED.LOW };
  assert.deepEqual(buildQRCommands({ power: POWER_ON, mode: AC_MODE.HEAT, temp: 25, wind: FAN_SPEED.LOW }, known), [
    { code: 'PowerOn', value: 'PowerOn' },
    { code: 'M', value: AC_MODE.HEAT },
    { code: 'T', value: 25 },
  ]);
});

test('commands: turning on into the same settings sends only PowerOn', () => {
  const known = { power: POWER_OFF, mode: AC_MODE.COOL, temp: 23, wind: FAN_SPEED.LOW };
  assert.deepEqual(buildQRCommands({ ...known, power: POWER_ON }, known), [{ code: 'PowerOn', value: 'PowerOn' }]);
});

test('commands: while on, only the changed setting is sent', () => {
  const known = { power: POWER_ON, mode: AC_MODE.COOL, temp: 23, wind: FAN_SPEED.LOW };
  assert.deepEqual(buildQRCommands({ ...known, temp: 24 }, known), [{ code: 'T', value: 24 }]);
  assert.deepEqual(buildQRCommands({ ...known, wind: FAN_SPEED.HIGH }, known), [{ code: 'F', value: FAN_SPEED.HIGH }]);
  assert.deepEqual(buildQRCommands({ ...known }, known), []);
});

test('commands: turning off sends only PowerOff, and nothing when already off', () => {
  const desired = { power: POWER_OFF, mode: AC_MODE.HEAT, temp: 30, wind: FAN_SPEED.HIGH };
  assert.deepEqual(buildQRCommands(desired, { power: POWER_ON }), [{ code: 'PowerOff', value: 'PowerOff' }]);
  assert.deepEqual(buildQRCommands(desired, { power: POWER_OFF }), []);
});

test('commands: unknown state sends PowerOn and the full desired state', () => {
  assert.deepEqual(buildQRCommands({ power: POWER_ON, mode: AC_MODE.COOL, temp: 24, wind: FAN_SPEED.AUTO }, {}), [
    { code: 'PowerOn', value: 'PowerOn' },
    { code: 'M', value: AC_MODE.COOL },
    { code: 'T', value: 24 },
    { code: 'F', value: FAN_SPEED.AUTO },
  ]);
});

test('commands: a sent function updates the known state (M / T / F also power the AC on)', () => {
  assert.deepEqual(knownStateAfterCommand({ code: 'PowerOff', value: 'PowerOff' }), { power: POWER_OFF });
  assert.deepEqual(knownStateAfterCommand({ code: 'M', value: AC_MODE.HEAT }), { power: POWER_ON, mode: AC_MODE.HEAT });
  assert.deepEqual(knownStateAfterCommand({ code: 'F', value: FAN_SPEED.HIGH }), { power: POWER_ON, wind: FAN_SPEED.HIGH });
});

test('cloud status: remote status codes map to AC state', () => {
  assert.deepEqual(statusToState([
    { code: 'power', value: true }, { code: 'mode', value: '1' }, { code: 'temp', value: 22 },
    { code: 'wind', value: 3 }, { code: 'PowerOn', value: 'PowerOn' }, { code: 'temp', value: null },
  ]), { power: POWER_ON, mode: AC_MODE.HEAT, temp: 22, wind: FAN_SPEED.HIGH });
  assert.deepEqual(statusToState([{ code: 'power', value: 0 }]), { power: POWER_OFF });
});

test('hub: Smart AC Controller (hwktwkq) data points map to AC state and sensors', () => {
  const dps = { 1: false, 2: 254, 3: 23, 4: 'cold', 5: 'low', 9: 30, 10: 17, 11: 'c', 12: 64 };
  assert.deepEqual(hubDpsToState(dps), {
    power: POWER_OFF, mode: AC_MODE.COOL, temp: 23, wind: FAN_SPEED.LOW, currentTemperature: 25.4, humidity: 64,
  });
});

test('hub: every reported mode and fan speed is recognised', () => {
  const modes = { cold: AC_MODE.COOL, warm: AC_MODE.HEAT, auto: AC_MODE.AUTO, air: AC_MODE.FAN, dehumidify: AC_MODE.DEHUMIDIFIER };
  for (const [name, mode] of Object.entries(modes)) {
    assert.equal(hubDpsToState({ 4: name }).mode, mode, name);
  }
  const fans = { auto: FAN_SPEED.AUTO, low: FAN_SPEED.LOW, middle: FAN_SPEED.MIDDLE, high: FAN_SPEED.HIGH };
  for (const [name, wind] of Object.entries(fans)) {
    assert.equal(hubDpsToState({ 5: name }).wind, wind, name);
  }
});

test('hub: partial reports only return reported values; unknown values are ignored', () => {
  assert.deepEqual(hubDpsToState({ 1: true }), { power: POWER_ON });
  assert.deepEqual(hubDpsToState({ 4: 'turbo', 5: null, 3: null }), {});
});

test('hub: data point ids and temperature divisor can be overridden', () => {
  const state = hubDpsToState({ 101: true, 102: 21, 103: 'hot' }, { power: '101', currentTemperature: '102', mode: '103' }, 1);
  assert.deepEqual(state, { power: POWER_ON, mode: AC_MODE.HEAT, currentTemperature: 21 });
});
