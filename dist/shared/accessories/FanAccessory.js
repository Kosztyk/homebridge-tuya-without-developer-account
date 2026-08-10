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
    RGB_EFFECT: ['colour_switch'],
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
        // DP20/switch_led controls the white lamp and DP24/colour_data controls
        // the static RGB colour. Selecting/sending a colour turns the RGB LEDs
        // on. Proprietary raw DP103 reports RGB on/off. The public
        // colour_switch function is NOT RGB power on this firmware: setting it
        // true starts the rainbow/effect mode. Keep this behavior product-scoped.
        return this.device?.product_id === 'atfenlerda169ygw'
            && !!this.getSchema(...SCHEMA_CODE.LIGHT_ON)
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
        const color = this.getSchema(...SCHEMA_CODE.LIGHT_COLOR);
        const rgbEffect = this.getSchema(...SCHEMA_CODE.RGB_EFFECT);
        const whiteService = this.lightService();
        const rgbService = this.rgbLightService();
        // v1.0.48 used the un-subtyped light as one combined RGBCW service.
        // Reuse that stable service as the white lamp and strip RGB-only
        // characteristics from it.
        this.removeCharacteristicIfPresent(whiteService, this.Characteristic.Hue);
        this.removeCharacteristicIfPresent(whiteService, this.Characteristic.Saturation);
        (0, Light_1.configureLight)(this, whiteService, whiteOn, this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), this.getSchema(...SCHEMA_CODE.LIGHT_TEMP), undefined, undefined);
        // Static RGB power is unusual on this product. `colour_switch=true`
        // starts a rainbow effect, so it must never back HomeKit's normal On
        // characteristic. Treat RGB as an HSV-only light: selecting/sending
        // colour_data turns it on. Incoming raw DP103 is status feedback only.
        // For OFF, use the writable semantic `colour_switch=false` command that
        // Tuya exposes in the device schema; the QR endpoint rejects raw
        // numeric DP103 writes with error 2008. No RGB brightness is exposed.
        const syntheticRgbOn = { code: 'rgb_light_power' };
        (0, Light_1.configureLight)(this, rgbService, syntheticRgbOn, undefined, undefined, color, undefined, {
            skipOn: true,
            disableColorBrightness: true,
            disableAdaptiveLighting: true,
            preserveOffSchema: whiteOn,
            preserveOffDelayMs: 180,
        });
        this.configureRgbPower(rgbService, color, whiteOn, rgbEffect);
        this.seedLastRgbColor(color);
        this.log.info('Detected dual-light fan firmware: white light + static RGB light (DP103 status, colour_data HSV); RGB OFF uses one colour_switch=false command and never enters effect mode.');
    }
    parseRgbPowerValue(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            if (value === 1) {
                return true;
            }
            if (value === 0) {
                return false;
            }
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['on', 'true', '1'].includes(normalized)) {
                return true;
            }
            if (['off', 'false', '0'].includes(normalized)) {
                return false;
            }
        }
        return undefined;
    }
    getRgbPowerState() {
        const synthetic = this.getStatus('rgb_light_power');
        const mapped = this.parseRgbPowerValue(synthetic?.value);
        if (mapped !== undefined) {
            return mapped;
        }
        const raw = this.getStatus('103');
        const rawMapped = this.parseRgbPowerValue(raw?.value);
        if (rawMapped !== undefined) {
            return rawMapped;
        }
        if (typeof this.accessory.context?.rgbLightPower === 'boolean') {
            return this.accessory.context.rgbLightPower;
        }
        return false;
    }
    setRgbPowerState(value) {
        const normalized = !!value;
        this.accessory.context.rgbLightPower = normalized;
        if (this.device) {
            const current = this.device.status.find(status => status.code === 'rgb_light_power');
            if (current) {
                current.value = normalized;
            }
            else {
                this.device.status.push({ code: 'rgb_light_power', value: normalized });
            }
        }
    }
    normalizeRgbColor(value) {
        if (value === undefined || value === null || value === '' || value === '{}') {
            return undefined;
        }
        try {
            const raw = typeof value === 'string' ? JSON.parse(value) : value;
            if (!raw || typeof raw !== 'object') {
                return undefined;
            }
            const h = Number(raw.h);
            const sat = Number(raw.s);
            const val = Number(raw.v);
            if (![h, sat, val].every(Number.isFinite)) {
                return undefined;
            }
            return JSON.stringify({ h, s: sat, v: val });
        }
        catch (_error) {
            return undefined;
        }
    }
    seedLastRgbColor(colorSchema) {
        if (!colorSchema) {
            return;
        }
        const live = this.normalizeRgbColor(this.getStatus(colorSchema.code)?.value);
        if (live) {
            this.accessory.context.rgbLastColourData = live;
        }
    }
    getLastRgbColor(colorSchema) {
        const live = colorSchema ? this.normalizeRgbColor(this.getStatus(colorSchema.code)?.value) : undefined;
        if (live) {
            this.accessory.context.rgbLastColourData = live;
            return live;
        }
        const saved = this.normalizeRgbColor(this.accessory.context?.rgbLastColourData);
        if (saved) {
            return saved;
        }
        // Fan1's verified payload uses v=390 and this firmware does not expose
        // RGB brightness. Use a visible red fallback only until a real colour
        // has been observed, then persist the actual HSV payload in context.
        return JSON.stringify({ h: 0, s: 1000, v: 390 });
    }
    async sendRgbColorPreservingWhite(colorSchema, whiteOnSchema, colorValue) {
        const preserveWhiteOff = !!whiteOnSchema && this.getStatus(whiteOnSchema.code)?.value === false;
        await this.sendCommands([{ code: colorSchema.code, value: colorValue }], false);
        if (preserveWhiteOff) {
            await new Promise(resolve => setTimeout(resolve, 180));
            await this.sendCommands([{ code: whiteOnSchema.code, value: false }], false);
        }
    }
    configureRgbPower(service, colorSchema, whiteOnSchema, rgbEffectSchema) {
        const onCharacteristic = service.getCharacteristic(this.Characteristic.On);
        onCharacteristic
            .onGet(() => {
            this.checkOnlineStatus();
            return this.getRgbPowerState();
        })
            .onSet(async (value) => {
            const turnOn = !!value;
            if (turnOn) {
                // Serialize a later ON behind any already-running OFF write so
                // both operations cannot race each other.
                if (this.rgbOffPromise) {
                    try {
                        await this.rgbOffPromise;
                    }
                    catch (_error) {
                        // Continue with the explicit ON request even if the
                        // preceding OFF operation failed.
                    }
                }
                // Do not write colour_switch=true for normal RGB ON: this
                // firmware interprets that as rainbow/effect mode. Re-send the
                // last static HSV colour instead.
                const lastColor = this.getLastRgbColor(colorSchema);
                await this.sendRgbColorPreservingWhite(colorSchema, whiteOnSchema, lastColor);
                this.rgbOffSuppressUntil = 0;
                this.setRgbPowerState(true);
                onCharacteristic.updateValue(true);
                return;
            }
            if (!rgbEffectSchema) {
                this.log.warn('Cannot turn RGB off: writable colour_switch schema is missing.');
                throw new Error('RGB OFF is unavailable because colour_switch is missing.');
            }
            // If HomeKit repeats OFF after we have already completed the write,
            // acknowledge it locally instead of sending another cloud command.
            if (this.getRgbPowerState() === false) {
                onCharacteristic.updateValue(false);
                return;
            }
            // HomeKit can issue several OFF writes while characteristics are
            // refreshed. Coalesce concurrent writes into one cloud operation.
            if (!this.rgbOffPromise) {
                this.rgbOffPromise = (async () => {
                    try {
                        // User testing proved that a plain colour_switch=false
                        // is accepted by the HA QR API and turns the static RGB
                        // channel off. Never send colour_switch=true here: TRUE
                        // is the rainbow/effect mode and causes a visible flash.
                        this.log.info('Turning static RGB off with colour_switch=false.');
                        const result = await this.sendCommands([{ code: rgbEffectSchema.code, value: false }], false);
                        if (result === false) {
                            throw new Error('Tuya rejected colour_switch=false');
                        }
                        // For a HomeKit-originated OFF, the successful command is
                        // authoritative. Do not wait for DP103, which may not be
                        // emitted for this path. Ignore a short burst of stale
                        // colour_data reports so they cannot immediately turn the
                        // synthetic HomeKit power state back on.
                        this.rgbOffSuppressUntil = Date.now() + 900;
                        this.setRgbPowerState(false);
                        onCharacteristic.updateValue(false);
                    }
                    catch (error) {
                        // Keep HomeKit aligned with the last known active state if
                        // the cloud write really failed.
                        this.setRgbPowerState(true);
                        onCharacteristic.updateValue(true);
                        throw error;
                    }
                    finally {
                        this.rgbOffPromise = undefined;
                    }
                })();
            }
            return this.rgbOffPromise;
        });
    }
    async onDeviceStatusUpdate(status) {
        if (this.hasSeparateRgbLight() && Array.isArray(status)) {
            const colorCodes = new Set(SCHEMA_CODE.LIGHT_COLOR.map(code => code.toLowerCase()));
            for (const item of status) {
                const code = String(item?.code ?? '').toLowerCase();
                if (colorCodes.has(code)) {
                    const normalizedColor = this.normalizeRgbColor(item.value);
                    if (normalizedColor) {
                        this.accessory.context.rgbLastColourData = normalizedColor;
                        // On this product, a static colour report normally means
                        // the RGB LEDs are active. Immediately after a successful
                        // HomeKit OFF, however, Tuya can echo stale colour_data;
                        // suppress only that short echo window so HomeKit does
                        // not jump back to ON after the light is already off.
                        if (!(this.rgbOffSuppressUntil && Date.now() < this.rgbOffSuppressUntil)) {
                            this.setRgbPowerState(true);
                        }
                    }
                    continue;
                }
                if (code === 'rgb_light_power' || code === '103') {
                    const power = this.parseRgbPowerValue(item.value);
                    if (power !== undefined) {
                        this.setRgbPowerState(power);
                    }
                }
            }
        }
        await super.onDeviceStatusUpdate(status);
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