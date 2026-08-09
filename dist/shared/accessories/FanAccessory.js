"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TuyaDevice_1 = require("../../cloud/device/TuyaDevice");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const Light_1 = require("./characteristic/Light");
const LockPhysicalControls_1 = require("./characteristic/LockPhysicalControls");
const On_1 = require("./characteristic/On");
const RotationSpeed_1 = require("./characteristic/RotationSpeed");
const SwingMode_1 = require("./characteristic/SwingMode");
const SCHEMA_CODE = {
    FAN_ON: ['switch_fan', 'fan_switch', 'switch'],
    FAN_DIRECTION: ['fan_direction'],
    FAN_SPEED: ['fan_speed', 'fan_speed_percent'],
    FAN_SPEED_LEVEL: ['fan_speed_enum', 'fan_speed'],
    FAN_LOCK: ['child_lock'],
    FAN_SWING: ['switch_horizontal', 'switch_vertical'],
    LIGHT_ON: ['light', 'switch_led'],
    RGB_LIGHT_ON: ['colour_switch'],
    LIGHT_MODE: ['work_mode'],
    LIGHT_BRIGHT: ['bright_value', 'bright_value_v2'],
    LIGHT_TEMP: ['temp_value', 'temp_value_v2'],
    LIGHT_COLOR: ['colour_data', 'colour_data_v2'],
};
class FanAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.FAN_ON];
    }
    configureServices() {
        if (this.fanServiceType() === this.Service.Fan) {
            const unusedService = this.accessory.getService(this.Service.Fanv2);
            if (unusedService) {
                this.accessory.removeService(unusedService);
            }
            (0, On_1.configureOn)(this, this.fanService(), this.getSchema(...SCHEMA_CODE.FAN_ON));
        }
        else if (this.fanServiceType() === this.Service.Fanv2) {
            const unusedService = this.accessory.getService(this.Service.Fan);
            if (unusedService) {
                this.accessory.removeService(unusedService);
            }
            (0, Active_1.configureActive)(this, this.fanService(), this.getSchema(...SCHEMA_CODE.FAN_ON));
            (0, LockPhysicalControls_1.configureLockPhysicalControls)(this, this.fanService(), this.getSchema(...SCHEMA_CODE.FAN_LOCK));
            (0, SwingMode_1.configureSwingMode)(this, this.fanService(), this.getSchema(...SCHEMA_CODE.FAN_SWING));
        }
        // Common Characteristics
        if (this.getFanSpeedSchema()) {
            (0, RotationSpeed_1.configureRotationSpeed)(this, this.fanService(), this.getFanSpeedSchema());
        }
        else if (this.getFanSpeedLevelSchema()) {
            (0, RotationSpeed_1.configureRotationSpeedLevel)(this, this.fanService(), this.getFanSpeedLevelSchema());
        }
        else {
            (0, RotationSpeed_1.configureRotationSpeedOn)(this, this.fanService(), this.getSchema(...SCHEMA_CODE.FAN_ON));
        }
        this.configureRotationDirection();
        // Light
        if (this.getSchema(...SCHEMA_CODE.LIGHT_ON)) {
            if (this.hasSeparateRgbLight()) {
                this.configureSeparateWhiteAndRgbLights();
            }
            else if (this.lightServiceType() === this.Service.Lightbulb) {
                (0, Light_1.configureLight)(this, this.lightService(), this.getSchema(...SCHEMA_CODE.LIGHT_ON), this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), this.getSchema(...SCHEMA_CODE.LIGHT_TEMP), this.getSchema(...SCHEMA_CODE.LIGHT_COLOR), this.getSchema(...SCHEMA_CODE.LIGHT_MODE));
                const obsoleteRgb = this.accessory.getServiceById(this.Service.Lightbulb, 'rgb_light');
                if (obsoleteRgb) {
                    this.accessory.removeService(obsoleteRgb);
                }
            }
            else if (this.lightServiceType() === this.Service.Switch) {
                (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_ON));
                const unusedService = this.accessory.getService(this.Service.Lightbulb);
                if (unusedService) {
                    this.accessory.removeService(unusedService);
                }
                const obsoleteRgb = this.accessory.getServiceById(this.Service.Lightbulb, 'rgb_light');
                if (obsoleteRgb) {
                    this.accessory.removeService(obsoleteRgb);
                }
            }
        }
    }
    hasSeparateRgbLight() {
        // Verified from live Device Sharing MQTT for PID atfenlerda169ygw:
        // DP20/switch_led controls the white lamp, DP24/colour_data carries
        // the RGB HSV colour, and proprietary raw DP103 is the RGB power state
        // exposed by the cloud specification as colour_switch. Keep the quirk
        // product-scoped until another fan confirms the same wiring.
        return this.device?.product_id === 'atfenlerda169ygw'
            && !!this.getSchema(...SCHEMA_CODE.LIGHT_ON)
            && !!this.getSchema(...SCHEMA_CODE.RGB_LIGHT_ON)
            && !!this.getSchema(...SCHEMA_CODE.LIGHT_COLOR);
    }
    removeCharacteristicIfPresent(service, characteristicType) {
        if (!service || !service.testCharacteristic(characteristicType)) {
            return;
        }
        service.removeCharacteristic(service.getCharacteristic(characteristicType));
    }
    rgbLightService() {
        return this.accessory.getServiceById(this.Service.Lightbulb, 'rgb_light')
            || this.accessory.addService(this.Service.Lightbulb, `${this.accessory.displayName} RGB Light`, 'rgb_light');
    }
    configureSeparateWhiteAndRgbLights() {
        const whiteOn = this.getSchema(...SCHEMA_CODE.LIGHT_ON);
        const rgbOn = this.getSchema(...SCHEMA_CODE.RGB_LIGHT_ON);
        const color = this.getSchema(...SCHEMA_CODE.LIGHT_COLOR);
        const whiteService = this.lightService();
        const rgbService = this.rgbLightService();
        // v1.0.48/early-v1.0.49 used the un-subtyped light as one combined
        // RGBCW service. Reuse that service as the white lamp so its HomeKit
        // service identity stays stable, but remove RGB-only characteristics.
        this.removeCharacteristicIfPresent(whiteService, this.Characteristic.Hue);
        this.removeCharacteristicIfPresent(whiteService, this.Characteristic.Saturation);
        (0, Light_1.configureLight)(this, whiteService, whiteOn, this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), this.getSchema(...SCHEMA_CODE.LIGHT_TEMP), undefined, undefined);
        // The decorative RGB channel is independent of the white lamp. The
        // owner confirmed RGB brightness is not adjustable, so expose only
        // On, Hue and Saturation and preserve colour_data.v unchanged.
        (0, Light_1.configureLight)(this, rgbService, rgbOn, undefined, undefined, color, undefined, {
            disableColorBrightness: true,
            disableAdaptiveLighting: true,
            preserveOffSchema: whiteOn,
            preserveOffDelayMs: 180,
        });
        this.log.info('Detected dual-light fan firmware: exposing separate white and RGB HomeKit Lightbulb services.');
    }
    fanServiceType() {
        if (this.getSchema(...SCHEMA_CODE.FAN_LOCK)
            || this.getSchema(...SCHEMA_CODE.FAN_SWING)) {
            return this.Service.Fanv2;
        }
        return this.Service.Fan;
    }
    fanService() {
        const serviceType = this.fanServiceType();
        return this.accessory.getService(serviceType)
            || this.accessory.addService(serviceType);
    }
    lightServiceType() {
        if (this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT)
            || this.getSchema(...SCHEMA_CODE.LIGHT_TEMP)
            || this.getSchema(...SCHEMA_CODE.LIGHT_COLOR)
            || this.getSchema(...SCHEMA_CODE.LIGHT_MODE)) {
            return this.Service.Lightbulb;
        }
        return this.Service.Switch;
    }
    lightService() {
        return this.accessory.getService(this.Service.Lightbulb)
            || this.accessory.addService(this.Service.Lightbulb);
    }
    getFanSpeedSchema() {
        const schema = this.getSchema(...SCHEMA_CODE.FAN_SPEED);
        if (schema && schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Integer) {
            return schema;
        }
        return undefined;
    }
    getFanSpeedLevelSchema() {
        const schema = this.getSchema(...SCHEMA_CODE.FAN_SPEED_LEVEL);
        if (schema && schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Enum) {
            return schema;
        }
        return undefined;
    }
    configureRotationDirection() {
        const schema = this.getSchema(...SCHEMA_CODE.FAN_DIRECTION);
        if (!schema) {
            return;
        }
        const { CLOCKWISE, COUNTER_CLOCKWISE } = this.Characteristic.RotationDirection;
        this.fanService().getCharacteristic(this.Characteristic.RotationDirection)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return (status.value !== 'reverse') ? CLOCKWISE : COUNTER_CLOCKWISE;
        })
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: (value === CLOCKWISE) ? 'forward' : 'reverse' }]);
        });
    }
}
exports.default = FanAccessory;
//# sourceMappingURL=FanAccessory.js.map