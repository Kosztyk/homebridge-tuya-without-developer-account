"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const presetsHelper = require('../dist/shared/accessories/characteristic/FanSpeedPresets');

function createModule() {
  const moduleUnderTest = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../dist/shared/accessories/characteristic/RotationSpeed'), 'utf8'), {
    exports: moduleUnderTest.exports,
    require(name) {
      if (name === '../../util/util') return { limit: (x, a, b) => Math.max(a, Math.min(x, b)) };
      if (name === './FanSpeedPresets') return presetsHelper;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return moduleUnderTest.exports;
}
const { configureRotationSpeed, configureRotationSpeedLevel } = createModule();

function fixture(schema, initialValue) {
  const writes = [];
  const status = { value: initialValue };
  const char = {
    values: [],
    onGet(fn) { this.get = fn; return this; },
    onSet(fn) { this.set = fn; return this; },
    setProps(props) { this.props = props; return this; },
    updateValue(value) { this.values.push(value); this.value = value; return this; },
  };
  const accessory = {
    Characteristic: { RotationSpeed: 'RotationSpeed' },
    getStatus: code => code === schema.code ? status : undefined,
    sendCommands: async commands => writes.push(...commands),
    log: { debug() {} },
  };
  const service = { getCharacteristic: () => char };
  return { accessory, service, char, status, writes };
}

const four = [25, 50, 75, 100];

test('validates strict ascending fan percentages and rejects invalid values', () => {
  assert.deepEqual(presetsHelper.normalizeFanSpeedPresets(four), four);
  for (const invalid of [[], [25], [25,50,75], [0,25,50,100], [25,25,100], [50,25,100], [25,50,100.5], ['25',50,100], [25,101], '25,50,100']) {
    assert.equal(presetsHelper.normalizeFanSpeedPresets(invalid), undefined);
  }
});

test('uniform presets use HomeKit 25% step; irregular lists use HAP 1% with snapping', () => {
  assert.equal(presetsHelper.fanPresetMinStep(four), 25);
  assert.equal(presetsHelper.fanPresetMinStep([20, 50, 75, 100]), 1);
  assert.equal(presetsHelper.snapFanSpeed(39, four), 50);
  assert.equal(presetsHelper.snapFanSpeed(37.5, four), 50);
  assert.equal(presetsHelper.snapFanSpeed(0, four), 0);
});

test('native percentage fan snaps writes and displayed values', async () => {
  const schema = { code: 'fan_speed_percent', property: { min: 0, max: 100, step: 1, scale: 0 } };
  const d = fixture(schema, 44);
  configureRotationSpeed(d.accessory, d.service, schema, four);
  assert.equal(d.char.props.minStep, 25);
  assert.equal(d.char.props.maxValue, 100);
  assert.equal(d.char.get(), 50);
  assert.equal(d.char.value, 50);
  await d.char.set(38);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed_percent', value: 50 }]);
  assert.equal(d.char.value, 50);
  d.status.value = 81;
  assert.equal(d.char.get(), 75);
});

test('native scaled percentage fan honors Tuya scale and raw step', async () => {
  const schema = { code: 'fan_speed_percent', property: { min: 0, max: 1000, step: 10, scale: 1 } };
  const d = fixture(schema, 600);
  configureRotationSpeed(d.accessory, d.service, schema, four);
  await d.char.set(70);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed_percent', value: 750 }]);
  assert.equal(d.char.value, 75);
});

test('discrete six-speed fan maps preset to the closest real Tuya level', async () => {
  const schema = { code: 'fan_speed', property: { min: 1, max: 6, step: 1, scale: 0 } };
  const d = fixture(schema, 2);
  configureRotationSpeed(d.accessory, d.service, schema, four);
  assert.equal(d.char.props.minStep, 25);
  assert.equal(d.char.get(), 25); // actual 2/6=33%, nearest permitted is 25
  await d.char.set(72);           // request -> 75% -> level 5
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed', value: 5 }]);
  assert.equal(d.char.value, 75);
  await d.char.set(0);            // preserve existing independent power behavior
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes[1])), { code: 'fan_speed', value: 1 });
});

test('six-speed automatic mapping is unchanged without presets', async () => {
  const schema = { code: 'fan_speed', property: { min: 1, max: 6, step: 1, scale: 0 } };
  const d = fixture(schema, 1);
  configureRotationSpeed(d.accessory, d.service, schema);
  assert.ok(Math.abs(d.char.props.minStep - 100/6) < 0.001);
  assert.equal(d.char.get(), 17);
  await d.char.set(50);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed', value: 3 }]);
});

test('native percentage fan retains original 1% precision without presets', async () => {
  const schema = { code: 'fan_speed_percent', property: { min: 0, max: 100, step: 1, scale: 0 } };
  const d = fixture(schema, 42);
  configureRotationSpeed(d.accessory, d.service, schema);
  assert.equal(d.char.props.minStep, 1);
  assert.equal(d.char.get(), 42);
  await d.char.set(43);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed_percent', value: 43 }]);
});

test('enum fans opt into percentage presets without changing original enum handling', async () => {
  const schema = { code: 'fan_speed_enum', property: { range: ['low', 'medium', 'high', 'turbo'] } };
  const d = fixture(schema, 'medium');
  configureRotationSpeedLevel(d.accessory, d.service, schema, undefined, four);
  assert.equal(d.char.props.maxValue, 100);
  assert.equal(d.char.props.minStep, 25);
  assert.equal(d.char.get(), 50);
  await d.char.set(90);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed_enum', value: 'turbo' }]);
});

test('enum fans without presets keep original HomeKit level range', async () => {
  const schema = { code: 'fan_speed_enum', property: { range: ['low', 'medium', 'high'] } };
  const d = fixture(schema, 'medium');
  configureRotationSpeedLevel(d.accessory, d.service, schema);
  assert.equal(d.char.props.maxValue, 3);
  assert.equal(d.char.get(), 2);
  await d.char.set(3);
  assert.deepEqual(JSON.parse(JSON.stringify(d.writes)), [{ code: 'fan_speed_enum', value: 'high' }]);
});

test('rejected Tuya commands do not optimistically update snapped characteristic', async () => {
  const schema = { code: 'fan_speed_percent', property: { min: 0, max: 100, step: 1, scale: 0 } };
  const d = fixture(schema, 25);
  d.accessory.sendCommands = async () => { throw new Error('Tuya offline'); };
  configureRotationSpeed(d.accessory, d.service, schema, four);
  await assert.rejects(d.char.set(49), /Tuya offline/);
  assert.equal(d.char.value, 25);
});

test('fan override appears in custom UI, config schema and config change hash', () => {
  const ui = readFileSync(require.resolve('../homebridge-ui/public/index.html'), 'utf8');
  const platform = readFileSync(require.resolve('../dist/platform.js'), 'utf8');
  const schema = JSON.parse(readFileSync(require.resolve('../config.schema.json'), 'utf8'));
  assert.match(ui, /tuyaNodevApplyFan/);
  assert.match(ui, /renderFanPresetOverrides/);
  assert.match(ui, /ensureDeviceOverride\(id\)\.fan = \{ speedPresets: values \}/);
  assert.match(platform, /fan: deviceConfig\?\.fan \? JSON\.stringify/);
  assert.ok(schema.schema.properties.options.properties.deviceOverrides.items.properties.fan.properties.speedPresets);
});

test('platform validates fan presets independently and preserves other overrides', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const moduleUnderTest = { exports: {} };
  const imports = {
    path,
    fs,
    './cloud/api/TuyaHACloudAPI': { default: class {} },
    './cloud/device/TuyaHADeviceManager': { default: class {} },
    './shared/accessories/AccessoryFactory': { default: class {} },
    './shared/util/util': { sanitizeName: v => v },
    './shared/util/ConfigHash': { ConfigHash: class {} },
    './settings': { PLUGIN_NAME: 'test', PLATFORM_NAME: 'TuyaNoDeveloperAccount' },
    './shared/accessories/characteristic/FanSpeedPresets': presetsHelper,
  };
  vm.runInNewContext(readFileSync(require.resolve('../dist/platform.js'), 'utf8'), {
    exports: moduleUnderTest.exports,
    require(name) { if (!imports[name]) throw new Error(name); return imports[name]; },
  });
  const platform = Object.create(moduleUnderTest.exports.TuyaPlatform.prototype);
  const warnings = [];
  platform.log = { warn(...args) { warnings.push(args); } };
  platform.options = {
    deviceOverrides: [
      { id: 'fan-a', fan: { speedPresets: [25,50,75,100] }, switchNames: { switch_1: 'Keep Me' } },
      { id: 'fan-b', fan: { speedPresets: [25,25,100] }, windowCovering: { reverseControl: true } },
    ],
  };
  assert.equal(platform.validateDeviceOverrides(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(platform.options.deviceOverrides[0].fan.speedPresets)), four);
  assert.equal(platform.options.deviceOverrides[0].switchNames.switch_1, 'Keep Me');
  assert.equal(platform.options.deviceOverrides[1].fan, undefined);
  assert.equal(platform.options.deviceOverrides[1].windowCovering.reverseControl, true);
  assert.equal(warnings.length, 1);
});

test('custom UI parse function enforces valid preset lists', () => {
  const ui = readFileSync(require.resolve('../homebridge-ui/public/index.html'), 'utf8');
  const script = ui.split('<script>')[1].split('</script>')[0]
    .replace('  window.homebridge.addEventListener(\'ready\', init);',
      '  window.testParser = parseFanPresetInput;');
  const context = { window: {}, document: {}, console };
  vm.runInNewContext(script, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.testParser('25, 50; 75 100'))), four);
  assert.throws(() => context.window.testParser('25, 50, 75'), /ascending integer percentages/);
  assert.throws(() => context.window.testParser('25, 25, 100'), /ascending integer percentages/);
});
