"use strict";
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

// Load the shipped garage handler without requiring unrelated plugin dependencies.
const moduleUnderTest = { exports: {} };
vm.runInNewContext(readFileSync(require.resolve('../dist/shared/accessories/GarageDoorAccessory'), 'utf8'), {
    exports: moduleUnderTest.exports,
    require: name => {
        assert.equal(name, './BaseAccessory');
        return { __esModule: true, default: class {} };
    },
});
const GarageDoorAccessory = moduleUnderTest.exports.default;

function fixture() {
    const handlers = new Map();
    const status = new Map([['doorcontact_state', false], ['switch_1', false]]);
    const commands = [];
    const garage = new GarageDoorAccessory();
    garage.Characteristic = {
        CurrentDoorState: { OPEN: 0, CLOSED: 1, STOPPED: 4 },
        TargetDoorState: { OPEN: 0, CLOSED: 1 },
    };
    garage.mainService = () => ({
        getCharacteristic: type => {
            if (!handlers.has(type)) {
                handlers.set(type, {
                    onGet(callback) { this.get = callback; return this; },
                    onSet(callback) { this.set = callback; return this; },
                });
            }
            return handlers.get(type);
        },
    });
    garage.getSchema = code => status.has(code) ? { code } : undefined;
    garage.getStatus = code => status.has(code) ? { code, value: status.get(code) } : undefined;
    garage.sendCommands = async values => commands.push(...values);
    garage.configureServices();
    return {
        status, commands,
        current: handlers.get(garage.Characteristic.CurrentDoorState),
        target: handlers.get(garage.Characteristic.TargetDoorState),
    };
}

test('physical remote open/close follows the sensor while switch_1 stays false', () => {
    const { status, current, target } = fixture();
    assert.equal(current.get(), 1);
    status.set('doorcontact_state', true);
    assert.equal(current.get(), 0);
    assert.equal(target.get(), 0);
    status.set('doorcontact_state', false);
    assert.equal(current.get(), 1);
    assert.equal(target.get(), 1);
});

test('stale open command cannot make a closed door report opening', () => {
    const { status, current, target } = fixture();
    status.set('switch_1', true);
    assert.equal(current.get(), 1);
    assert.equal(target.get(), 1);
});

test('missing or invalid sensor reports STOPPED and target falls back to switch_1', () => {
    const { status, current, target } = fixture();
    status.set('doorcontact_state', undefined);
    assert.equal(current.get(), 4);
    status.delete('doorcontact_state');
    assert.equal(current.get(), 4);
    status.set('switch_1', true);
    assert.equal(target.get(), 0);
});

test('HomeKit open/close writes still send the original switch_1 commands', async () => {
    const { target, commands } = fixture();
    await target.set(0);
    await target.set(1);
    assert.equal(JSON.stringify(commands), JSON.stringify([
        { code: 'switch_1', value: true },
        { code: 'switch_1', value: false },
    ]));
});
