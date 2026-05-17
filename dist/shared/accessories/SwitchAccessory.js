"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TuyaDevice_1 = require("../../cloud/device/TuyaDevice");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Name_1 = require("./characteristic/Name");
const On_1 = require("./characteristic/On");
const EnergyUsage_1 = require("./characteristic/EnergyUsage");
const CurrentTemperature_1 = require("./characteristic/CurrentTemperature");
const CurrentRelativeHumidity_1 = require("./characteristic/CurrentRelativeHumidity");
const SCHEMA_CODE = {
    ON: ['switch', 'switch_1'], // switch_2, switch_3, switch_4, ..., switch_usb1, switch_usb2, switch_usb3, ..., switch_backlight
    CURRENT: ['cur_current'],
    POWER: ['cur_power'],
    VOLTAGE: ['cur_voltage'],
    TOTAL_POWER: ['add_ele'],
    CURRENT_TEMP: ['va_temperature', 'temp_current'],
    CURRENT_HUMIDITY: ['va_humidity', 'humidity_value'],
    INCHING: ['switch_inching'],
};
class SwitchAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ON];
    }
    configureServices() {
        const oldService = this.accessory.getService(this.mainService());
        if (oldService && oldService?.subtype === undefined) {
            this.platform.log.warn('Remove old service:', oldService.UUID);
            this.accessory.removeService(oldService);
        }
        const schemata = this.device.schema.filter((schema) => schema.code.startsWith('switch') && schema.type === TuyaDevice_1.TuyaDeviceSchemaType.Boolean);
        this.log.info(`[SwitchAccessory] Found ${schemata.length} switch schemas: ${schemata.map(s => s.code).join(', ')}`);
        // Track which switch services should exist
        const validSubtypes = new Set(schemata.map(s => s.code));
        // Remove any old switch services that are no longer in the schema.
        // Match both Switch and Outlet UUIDs since OutletAccessory uses Service.Outlet.
        const switchOrOutletUUIDs = new Set([this.Service.Switch.UUID, this.Service.Outlet.UUID]);
        const allSwitchServices = this.accessory.services.filter(s => switchOrOutletUUIDs.has(s.UUID) && s.subtype);
        // Check early if we'll be keeping services due to auto-detect or config unchanged
        const configChanged = this.device?.configChanged ?? true;
        const isAutoDetecting = this.device?.isAutoDetecting ?? false;
        const shouldRemoveExtras = configChanged && !isAutoDetecting;
        if (allSwitchServices.length > schemata.length) {
            if (shouldRemoveExtras) {
                this.log.warn(`[SwitchAccessory] Found ${allSwitchServices.length} cached switch services but only ${schemata.length} in schema. Removing extras...`);
            }
            else {
                this.log.info(`[SwitchAccessory] Found ${allSwitchServices.length} cached switch services but only ${schemata.length} in schema. ${isAutoDetecting ? 'Auto-detect in progress' : 'Config unchanged'} – keeping for now...`);
            }
        }
        const keptCachedServices = new Map();
        for (const oldService of allSwitchServices) {
            if (!validSubtypes.has(oldService.subtype)) {
                if (shouldRemoveExtras) {
                    // Config changed and not in auto-detect, so enforce the new schema
                    this.log.warn(`Removing old switch service: ${oldService.displayName} (subtype: ${oldService.subtype})`);
                    this.accessory.removeService(oldService);
                }
                else {
                    // Either config didn't change, or we're in auto-detect mode – keep cached services for now
                    // Auto-detection will add new ones when complete
                    this.log.debug(`${isAutoDetecting ? 'Auto-detect in progress' : 'Config unchanged'} for this device, keeping cached switch service: ` +
                        `${oldService.displayName} (subtype: ${oldService.subtype})`);
                    // Track the kept service to configure it
                    keptCachedServices.set(oldService.subtype, oldService);
                }
            }
        }
        // Now configure the switches in the schema
        schemata.forEach((schema, index) => {
            // Use human-readable names instead of raw code names (which contain underscores)
            let name;
            if (schemata.length === 1) {
                name = this.device.name;
            }
            else {
                // For multiple switches, append "#1", "#2", etc. or use "Switch 1", "Switch 2"
                const switchMatch = schema.code.match(/^switch_(\d+)$/);
                const switchNum = switchMatch ? switchMatch[1] : (index + 1).toString();
                name = `${this.device.name} ${switchNum}`;
            }
            this.configureSwitch(schema, name);
        });
        // Also configure cached services that aren't in schema (but weren't removed because config unchanged)
        for (const [subtype, service] of keptCachedServices.entries()) {
            const switchMatch = subtype.match(/^switch_(\d+)$/);
            const switchNum = switchMatch ? switchMatch[1] : subtype;
            const name = schemata.length === 1 ? this.device.name : `${this.device.name} ${switchNum}`;
            // Extract schema info from the cached service's current state
            // In this case we reuse the service without re-adding it
            (0, Name_1.configureName)(this, service, name);
        }
        // Other
        (0, CurrentTemperature_1.configureCurrentTemperature)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_TEMP));
        (0, CurrentRelativeHumidity_1.configureCurrentRelativeHumidity)(this, undefined, this.getSchema(...SCHEMA_CODE.CURRENT_HUMIDITY));
        this.configureInching();
    }
    async onDeviceInfoUpdate(info) {
        // Re-run service configuration so newly auto-detected switches get their handlers registered.
        this.configureServices();
        this.configureStatusActive();
        await this.updateAllValues();
    }
    mainService() {
        return this.Service.Switch;
    }
    configureSwitch(schema, name) {
        const service = this.accessory.getService(schema.code)
            || this.accessory.addService(this.mainService(), name, schema.code);
        (0, Name_1.configureName)(this, service, name);
        (0, On_1.configureOn)(this, service, schema);
        if (schema.code === this.getSchema(...SCHEMA_CODE.ON)?.code) {
            (0, EnergyUsage_1.configureEnergyUsage)(this.platform.api, this, service, this.getSchema(...SCHEMA_CODE.CURRENT), this.getSchema(...SCHEMA_CODE.POWER), this.getSchema(...SCHEMA_CODE.VOLTAGE), this.getSchema(...SCHEMA_CODE.TOTAL_POWER));
        }
    }
    configureInching() {
        const schema = this.getSchema(...SCHEMA_CODE.INCHING);
        if (!schema || schema.type !== TuyaDevice_1.TuyaDeviceSchemaType.String) {
            return;
        }
        const service = this.accessory.getService(schema.code)
            || this.accessory.addService(this.Service.Switch, schema.code, schema.code);
        (0, Name_1.configureName)(this, service, schema.code);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => {
            this.checkOnlineStatus();
            const status = this.getStatus(schema.code);
            const buffer = Buffer.from(status.value, 'base64');
            return (buffer.length === 3) && (buffer[0] === 1);
        })
            .onSet(async (value) => {
            const status = this.getStatus(schema.code);
            let buffer = Buffer.from(status.value, 'base64');
            if (buffer.length !== 3) {
                buffer = Buffer.alloc(3);
            }
            buffer[0] = value ? 1 : 0;
            await this.sendCommands([{
                    code: schema.code,
                    value: buffer.toString('base64'),
                }], true);
        });
    }
}
exports.default = SwitchAccessory;
//# sourceMappingURL=SwitchAccessory.js.map