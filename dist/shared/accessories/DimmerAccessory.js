"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Name_1 = require("./characteristic/Name");
const On_1 = require("./characteristic/On");
const SCHEMA_CODE = {
    ON: ['switch', 'switch_led', 'switch_1', 'switch_led_1'],
    BRIGHTNESS: ['bright_value', 'bright_value_1'],
};
class DimmerAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ON, SCHEMA_CODE.BRIGHTNESS];
    }
    configureServices() {
        const oldService = this.accessory.getService(this.Service.Lightbulb);
        if (oldService && oldService?.subtype === undefined) {
            this.platform.log.warn('Remove old service:', oldService.UUID);
            this.accessory.removeService(oldService);
        }
        const schema = this.device.schema.filter((schema) => schema.code.startsWith('bright_value'));
        for (const _schema of schema) {
            const suffix = _schema.code.replace('bright_value', '');
            const name = (schema.length === 1) ? this.device.name : _schema.code;
            const service = this.accessory.getService(_schema.code)
                || this.accessory.addService(this.Service.Lightbulb, name, _schema.code);
            (0, Name_1.configureName)(this, service, name);
            (0, On_1.configureOn)(this, service, this.getSchema('switch' + suffix, 'switch_led' + suffix));
            this.configureBrightness(service, suffix);
        }
    }
    configureBrightness(service, suffix) {
        const schema = this.getSchema('bright_value' + suffix);
        if (!schema) {
            return;
        }
        const { min, max } = schema.property;
        const range = max; // not max - min
        const props = {
            minValue: 0,
            maxValue: 100,
            minStep: 1,
        };
        const minStatus = this.getStatus('brightness_min' + suffix);
        const maxStatus = this.getStatus('brightness_max' + suffix);
        if (minStatus && maxStatus && maxStatus.value > minStatus.value) {
            const minValue = Math.ceil((0, util_1.remap)(minStatus.value, 0, range, 0, 100));
            const maxValue = Math.floor((0, util_1.remap)(maxStatus.value, 0, range, 0, 100));
            props.minValue = Math.max(props.minValue, minValue);
            props.maxValue = Math.min(props.maxValue, maxValue);
        }
        this.log.debug('Set props for Brightness:', props);
        service.getCharacteristic(this.Characteristic.Brightness)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            let value = status.value;
            value = (0, util_1.remap)(value, 0, range, 0, 100);
            value = Math.round(value);
            value = (0, util_1.limit)(value, props.minValue, props.maxValue);
            return value;
        })
            .onSet(async (value) => {
            this.log.debug(`Characteristic.Brightness set to: ${value}`);
            let brightValue = value;
            brightValue = (0, util_1.remap)(brightValue, 0, 100, 0, range);
            brightValue = Math.round(brightValue);
            brightValue = (0, util_1.limit)(brightValue, min, max);
            await this.sendCommands([{ code: schema.code, value: brightValue }], true);
        })
            .setProps(props);
    }
    async onDeviceStatusUpdate(status) {
        // brightness range updated
        if (status.length !== this.device.status.length) {
            for (const _status of status) {
                if (!_status.code.startsWith('brightness_min')
                    && !_status.code.startsWith('brightness_max')) {
                    continue;
                }
                this.platform.log.warn('Brightness range updated, please restart homebridge to take effect.');
                // TODO updating props
                // this.platform.log.debug('Brightness range updated, resetting props...');
                // this.configure();
                break;
            }
        }
        super.onDeviceStatusUpdate(status);
    }
}
exports.default = DimmerAccessory;
//# sourceMappingURL=DimmerAccessory.js.map