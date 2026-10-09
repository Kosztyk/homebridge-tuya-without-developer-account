"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

let now = 100000;
let nextTimer = 1;
const timers = new Map();
const setFakeTimeout = (fn, delay) => {
    const id = nextTimer++;
    timers.set(id, { fn, due: now + delay });
    return { id, unref() {} };
};
const clearFakeTimeout = timer => timers.delete(timer?.id);
function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) {
        if (timer.due <= now) {
            timers.delete(id);
            timer.fn();
        }
    }
}

const moduleUnderTest = { exports: {} };
vm.runInNewContext(readFileSync(require.resolve('../dist/shared/accessories/GarageDoorAccessory'), 'utf8'), {
    exports: moduleUnderTest.exports,
    require: name => {
        assert.equal(name, './BaseAccessory');
        return { __esModule: true, default: class {} };
    },
    setTimeout: setFakeTimeout,
    clearTimeout: clearFakeTimeout,
    Date: { now: () => now },
});
const GarageDoorAccessory = moduleUnderTest.exports.default;

function fixture(options = {}) {
    const handlers = new Map();
    const status = new Map([
        ['doorcontact_state', options.sensor ?? false],
        ['switch_1', options.switch ?? false],
    ]);
    const commands = [];
    let response = options.response;
    const garage = new GarageDoorAccessory();
    garage.Characteristic = {
        CurrentDoorState: { OPEN: 0, CLOSED: 1, STOPPED: 4 },
        TargetDoorState: { OPEN: 0, CLOSED: 1 },
    };
    garage.Service = { GarageDoorOpener: 'garage' };
    garage.accessory = {
        getService: () => service,
        addService: () => service,
    };
    const service = {
        getCharacteristic: type => {
            if (!handlers.has(type)) {
                handlers.set(type, {
                    value: undefined,
                    updates: [],
                    onGet(callback) { this.get = callback; return this; },
                    onSet(callback) { this.set = callback; return this; },
                    updateValue(value) { this.value = value; this.updates.push(value); return this; },
                });
            }
            return handlers.get(type);
        },
    };
    garage.getSchema = code => ['doorcontact_state', 'switch_1'].includes(code) ? { code } : undefined;
    garage.getStatus = code => status.has(code) ? { code, value: status.get(code) } : undefined;
    garage.sendCommands = async writes => {
        commands.push(...writes);
        if (response instanceof Error) { throw response; }
        return response;
    };
    garage.configureServices();
    const current = handlers.get(garage.Characteristic.CurrentDoorState);
    const target = handlers.get(garage.Characteristic.TargetDoorState);
    const refresh = () => {
        current.updateValue(current.get());
        target.updateValue(target.get());
    };
    return { garage, status, commands, current, target, refresh, setResponse: val => response = val };
}

test('physical remote changes OPEN/CLOSED and target even when switch_1 stays stale', () => {
    const { status, current, target, refresh } = fixture();
    assert.equal(current.get(), 1);
    assert.equal(target.get(), 1);
    status.set('doorcontact_state', true);
    refresh();
    assert.equal(current.value, 0);
    assert.equal(target.value, 0);
    status.set('doorcontact_state', false);
    refresh();
    assert.equal(current.value, 1);
    assert.equal(target.value, 1);
});

test('stale switch_1 true cannot misreport a closed contact as OPENING', () => {
    const { status, current, target } = fixture();
    status.set('switch_1', true);
    assert.equal(current.get(), 1);
    assert.equal(target.get(), 1);
});

test('sensor missing or invalid reports STOPPED; switch fallback handles absent values safely', () => {
    const { status, current, target } = fixture();
    status.set('doorcontact_state', undefined);
    assert.equal(current.get(), 4);
    status.set('switch_1', true);
    assert.equal(target.get(), 0);
    status.delete('doorcontact_state');
    assert.equal(current.get(), 4);
    status.delete('switch_1');
    assert.doesNotThrow(() => target.get());
    assert.equal(target.get(), 0); // last valid target
});

test('no sensor or switch values at startup gives safe fallback without throwing', () => {
    const { status, current, target } = fixture();
    status.delete('doorcontact_state');
    status.delete('switch_1');
    assert.equal(current.get(), 4);
    assert.equal(target.get(), 1);
});

test('HomeKit OPEN and CLOSE still write switch_1 true and false', async () => {
    const { target, commands } = fixture();
    await target.set(0);
    await target.set(1);
    assert.equal(JSON.stringify(commands), JSON.stringify([
        { code: 'switch_1', value: true },
        { code: 'switch_1', value: false },
    ]));
});

test('HomeKit OPEN intent remains OPEN while closed contact sensor has not caught up', async () => {
    const { status, target, current, refresh, garage } = fixture();
    await target.set(0);
    refresh();
    assert.equal(current.value, 1); // sensor still closed
    assert.equal(target.value, 0); // requested target stays open
    assert.equal(garage.pendingTarget, 0);
    status.set('doorcontact_state', true);
    refresh();
    assert.equal(current.value, 0);
    assert.equal(target.value, 0);
    assert.equal(garage.pendingTarget, undefined);
});

test('HomeKit CLOSE intent remains CLOSED while contact still open, then resolves', async () => {
    const { status, target, garage } = fixture({ sensor: true });
    await target.set(1);
    assert.equal(target.get(), 1);
    assert.equal(garage.pendingTarget, 1);
    status.set('doorcontact_state', false);
    assert.equal(target.get(), 1);
    assert.equal(garage.pendingTarget, undefined);
});

test('pending target expires and publishes actual sensor state without client polling', async () => {
    const { target, garage } = fixture();
    await target.set(0); // sensor false
    assert.equal(target.get(), 0);
    advance(45001);
    assert.equal(target.value, 1);
    assert.equal(target.get(), 1);
    assert.equal(garage.pendingTarget, undefined);
});

test('an older pending timeout cannot cancel a newer command', async () => {
    const { target, garage, status } = fixture({ sensor: true });
    await target.set(1); // pending CLOSE
    advance(20000);
    await target.set(0); // OPEN is already physical; pending clears upon read
    status.set('doorcontact_state', false);
    assert.equal(target.get(), 0);
    advance(25001); // past earlier timeout, but not newest
    assert.equal(target.get(), 0);
    assert.equal(garage.pendingTarget, 0);
});

test('rejected command clears pending state and restores actual target', async () => {
    const { target, garage } = fixture({ response: false });
    await assert.rejects(() => target.set(0), /Tuya rejected/);
    assert.equal(garage.pendingTarget, undefined);
    assert.equal(target.value, 1);
});

test('send error clears pending state without suppressing failure', async () => {
    const { target, garage } = fixture({ response: new Error('Network problem') });
    await assert.rejects(() => target.set(0), /Network problem/);
    assert.equal(garage.pendingTarget, undefined);
    assert.equal(target.value, 1);
});
