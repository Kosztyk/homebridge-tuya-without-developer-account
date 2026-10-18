"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("../util/util");
const IRAirConditionerHA_1 = require("../util/IRAirConditionerHA");
const IRHubLocalConnection_1 = __importDefault(require("../util/IRHubLocalConnection"));
const Name_1 = require("./characteristic/Name");
const IRAirConditionerAccessory_1 = __importDefault(require("./IRAirConditionerAccessory"));
const { POWER_OFF, POWER_ON, AC_MODE, FAN_SPEED, DEFAULT_TEMP_RANGE } = IRAirConditionerHA_1;
// The QR cloud rejects several IR AC functions in one request (code 1109); they are sent in order.
const COMMAND_GAP_MS = 500;
const HUB_RETRY_MS = 60 * 1000;
const FAN_SPEED_SUBTYPE = 'fan_speed';
const FAN_AUTO_SUBTYPE = 'fan_auto';
/**
 * IR air conditioner (`infrared_ac`) on the Tuya QR (Home Assistant sharing) cloud.
 *
 * The QR cloud has no `remote_keys` and no IR Control Hub API, so the parent
 * IRAirConditionerAccessory gets no modes, no temperature range and cannot send commands. This
 * subclass derives the ranges from the remote's QR specification, sends changes with the remote's
 * QR functions and, when the IR hub is reachable on the LAN, reads the real AC state (including
 * changes made with the physical remote), room temperature and humidity from the hub.
 * Without the hub the state is optimistic.
 *
 * Options (`deviceOverrides[].irAirConditioner`):
 *   hubId, hubIp, hubProtocolVersion   IR hub to read state from (default: the only IR hub in the home,
 *                                      found on the LAN, protocol 3.3)
 *   localState: false                  do not connect to the hub
 *   hubDps, currentTemperatureDivisor  hub data points if they differ from the defaults
 *   dryAndFanModes: false              no Dehumidifier / Fan mode services; adds a fan speed fan instead
 *   fanAutoSwitch: false               no "Fan Auto" switch
 *   names                              { airConditioner, fanSpeed, fanAuto, humidity }
 */
class IRAirConditionerHAAccessory extends IRAirConditionerAccessory_1.default {
    constructor(platform, accessory) {
        super(platform, accessory);
        this.irConfig = this.platform.getDeviceConfig?.(this.device)?.irAirConditioner || {};
        this.separateDryAndFanServices = this.irConfig.dryAndFanModes !== false;
        // util.debounce calls its function without `this`; bind it and keep errors off the timer.
        this.debounceSendACCommands = (0, util_1.debounce)(() => {
            this.sendACCommands().catch(error => this.log.warn(`Sending IR AC commands failed: ${error?.message || error}`));
        }, 100);
        const [min, max] = this.getTempRange(AC_MODE.COOL) || DEFAULT_TEMP_RANGE;
        // The QR cloud reports no state for IR remotes; keep it here (persisted across restarts).
        this.acState = {
            power: POWER_OFF,
            mode: AC_MODE.COOL,
            temp: Math.round((min + max) / 2),
            wind: FAN_SPEED.AUTO,
            ...(this.accessory.context.irAirConditionerState || {}),
        };
        // State the AC is known to be in: last hub report, cloud push or successful command.
        this.known = { ...this.acState };
        this.sensors = { ...(this.accessory.context.irAirConditionerSensors || {}) };
        this.hubConnection = undefined;
        this.sending = false;
        this.sendPending = false;
    }
    // ---- Parent integration ----
    // The parent reads modes and temperatures from `remote_keys.key_range`, which the QR cloud never
    // provides; fill it in from the QR specification (also after the device object is refreshed).
    get device() {
        const device = super.device;
        if (device && !device.remote_keys) {
            const config = this.platform.getDeviceConfig?.(device) || {};
            // Without dry and fan modes the parent creates no Dehumidifier / Fan services.
            const maxMode = config.irAirConditioner?.dryAndFanModes === false ? AC_MODE.AUTO : AC_MODE.DEHUMIDIFIER;
            device.remote_keys = { category_id: 5, key_range: (0, IRAirConditionerHA_1.buildKeyRange)(device.schema, config.airConditioner, maxMode) };
        }
        return device;
    }
    // The parent reads humidity from the hub's accessory; here the humidity sensor is on this one.
    getParentAccessory() {
        return this;
    }
    // The parent's Active handler always touches fanService(), which would add a Fan service.
    fanService() {
        if (this.supportFan()) {
            return super.fanService();
        }
        this.unusedFanService = this.unusedFanService || new this.Service.Fanv2('unused');
        return this.unusedFanService;
    }
    // ---- Services ----
    configureServices() {
        this.primeThresholdValues();
        super.configureServices();
        this.configureCurrentState();
        if (!this.separateDryAndFanServices) {
            this.removeParentServices(this.Service.HumidifierDehumidifier, this.Service.Fanv2);
            this.configureActiveInAllModes();
            this.configureFanSpeedService();
        }
        if (this.irConfig.fanAutoSwitch === false) {
            this.removeServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE);
        }
        else {
            this.configureFanAutoSwitch();
        }
        if (this.findHub()) {
            this.configureHumiditySensor();
            this.startLocalState();
        }
        this.configureServiceNames();
    }
    // Give the thresholds a valid value before the parent narrows their range, so HAP does not
    // warn about the default values (0 / 10 °C) being out of range.
    primeThresholdValues() {
        const thresholds = [
            [AC_MODE.HEAT, this.Characteristic.HeatingThresholdTemperature],
            [AC_MODE.COOL, this.Characteristic.CoolingThresholdTemperature],
        ];
        for (const [mode, characteristic] of thresholds) {
            if (this.getKeyRangeItem(mode)) {
                this.mainService().getCharacteristic(characteristic).updateValue(this.getTemp());
            }
        }
    }
    // The parent always reports IDLE; derive it from the AC state so Home shows Cooling / Heating.
    configureCurrentState() {
        const { INACTIVE, IDLE, HEATING, COOLING } = this.Characteristic.CurrentHeaterCoolerState;
        this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
            .onGet(() => {
            if (this.getPower() !== POWER_ON) {
                return INACTIVE;
            }
            const current = this.sensors.currentTemperature;
            switch (this.getMode()) {
                case AC_MODE.COOL:
                    return COOLING;
                case AC_MODE.HEAT:
                    return HEATING;
                case AC_MODE.AUTO:
                    if (current === undefined || current === this.getTemp()) {
                        return IDLE;
                    }
                    return current > this.getTemp() ? COOLING : HEATING;
                default:
                    // Fan and dry modes are shown by their own services, if there are any.
                    return this.separateDryAndFanServices ? INACTIVE : IDLE;
            }
        });
    }
    configureCurrentTemperature() {
        this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature)
            .onGet(() => this.sensors.currentTemperature ?? this.getTemp());
    }
    // Without the Dehumidifier / Fan services the AC is on in every mode (incl. dry / fan), and
    // turning it on works like the remote's power button: resume the last mode, never force Auto.
    configureActiveInAllModes() {
        const { INACTIVE, ACTIVE } = this.Characteristic.Active;
        this.mainService().getCharacteristic(this.Characteristic.Active)
            .onGet(() => (this.getPower() === POWER_ON ? ACTIVE : INACTIVE))
            .onSet(async (value) => {
            this.setPower(value === ACTIVE ? POWER_ON : POWER_OFF);
        });
    }
    // Fan speed is low / medium / high (1-3); auto has its own switch. While auto is on, the
    // slider shows the speed that turning auto off returns to.
    configureRotationSpeed(service) {
        service.getCharacteristic(this.Characteristic.RotationSpeed)
            .onGet(() => (this.getWind() === FAN_SPEED.AUTO ? this.lastManualWind() : this.getWind()))
            .onSet(async (value) => {
            if (value !== 0) {
                this.setWind(value);
            }
        })
            .setProps({ minValue: 0, maxValue: 3, minStep: 1 });
    }
    // Apple Home does not show a HeaterCooler's RotationSpeed, so manual fan speed gets its own fan.
    // It is on while the AC runs at a manual speed and off while the fan is on auto: turning it off
    // selects auto (the AC keeps running); turning it on returns to the last manual speed and turns
    // the AC on if needed.
    configureFanSpeedService() {
        const { INACTIVE, ACTIVE } = this.Characteristic.Active;
        const service = this.accessory.getServiceById(this.Service.Fanv2, FAN_SPEED_SUBTYPE)
            || this.accessory.addService(this.Service.Fanv2, `${this.accessory.displayName} Fan Speed`, FAN_SPEED_SUBTYPE);
        const runningAtManualSpeed = () => this.getPower() === POWER_ON && this.getWind() !== FAN_SPEED.AUTO;
        service.getCharacteristic(this.Characteristic.Active)
            .onGet(() => (runningAtManualSpeed() ? ACTIVE : INACTIVE))
            .onSet(async (value) => {
            if (value !== ACTIVE) {
                this.setWind(FAN_SPEED.AUTO);
                return;
            }
            if (this.getWind() === FAN_SPEED.AUTO) {
                this.setWind(this.lastManualWind());
            }
            this.powerOn();
        });
        service.getCharacteristic(this.Characteristic.RotationSpeed)
            .onGet(() => (runningAtManualSpeed() ? this.getWind() : 0))
            .onSet(async (value) => {
            if (value === 0) {
                return; // Home follows up with Active = 0, which selects auto.
            }
            this.setWind(value);
            this.powerOn();
        })
            .setProps({ minValue: 0, maxValue: 3, minStep: 1 });
        this.configureTargetFanState(service);
    }
    configureTargetFanState(service) {
        const { MANUAL, AUTO } = this.Characteristic.TargetFanState;
        service.getCharacteristic(this.Characteristic.TargetFanState)
            .onGet(() => (this.getWind() === FAN_SPEED.AUTO ? AUTO : MANUAL))
            .onSet(async (value) => {
            this.setWind(value === AUTO ? FAN_SPEED.AUTO : this.lastManualWind());
        });
    }
    configureFanAutoSwitch() {
        const service = this.accessory.getServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE)
            || this.accessory.addService(this.Service.Switch, `${this.accessory.displayName} Fan Auto`, FAN_AUTO_SUBTYPE);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => this.getWind() === FAN_SPEED.AUTO)
            .onSet(async (value) => {
            this.setWind(value ? FAN_SPEED.AUTO : this.lastManualWind());
        });
    }
    configureHumiditySensor() {
        const service = this.accessory.getService(this.Service.HumiditySensor)
            || this.accessory.addService(this.Service.HumiditySensor, `${this.accessory.displayName} Humidity`);
        service.getCharacteristic(this.Characteristic.CurrentRelativeHumidity)
            .onGet(() => this.sensors.humidity ?? 0);
    }
    // Name every service (the parent leaves the HeaterCooler unnamed, which Siri cannot address)
    // and make the HeaterCooler the primary service.
    configureServiceNames() {
        const names = this.irConfig.names || {};
        const base = this.device.name || this.accessory.displayName;
        const main = this.mainService();
        main.setPrimaryService(true);
        const services = [
            [main, base, names.airConditioner],
            [this.accessory.getServiceById(this.Service.Fanv2, FAN_SPEED_SUBTYPE), `${base} Fan Speed`, names.fanSpeed],
            [this.accessory.getServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE), `${base} Fan Auto`, names.fanAuto],
            [this.accessory.getService(this.Service.HumiditySensor), `${base} Humidity`, names.humidity],
        ];
        for (const [service, name, overrideName] of services) {
            if (service) {
                (0, Name_1.configureName)(this, service, name, { overrideName });
            }
        }
    }
    // Remove the parent's services of these types (keeps the fan speed fan added above).
    removeParentServices(...types) {
        for (const type of types) {
            const services = this.accessory.services.filter(service => service.UUID === type.UUID && service.subtype !== FAN_SPEED_SUBTYPE);
            for (const service of services) {
                this.accessory.removeService(service);
            }
        }
    }
    removeServiceById(type, subtype) {
        const service = this.accessory.getServiceById(type, subtype);
        if (service) {
            this.accessory.removeService(service);
        }
    }
    // ---- AC state ----
    getPower() {
        return this.acState.power;
    }
    setPower(value) {
        this.acState.power = value;
        this.debounceSendACCommands();
    }
    powerOn() {
        if (this.getPower() !== POWER_ON) {
            this.setPower(POWER_ON);
        }
    }
    getMode() {
        return this.acState.mode;
    }
    setMode(value) {
        this.acState.mode = value;
        this.debounceSendACCommands();
    }
    getTemp() {
        return this.acState.temp;
    }
    setTemp(value) {
        this.acState.temp = value;
        this.debounceSendACCommands();
    }
    getWind() {
        return this.acState.wind;
    }
    setWind(value) {
        this.acState.wind = value;
        this.rememberManualWind(value);
        this.debounceSendACCommands();
    }
    lastManualWind() {
        return this.acState.lastManualWind || FAN_SPEED.LOW;
    }
    rememberManualWind(value) {
        if (value !== FAN_SPEED.AUTO) {
            this.acState.lastManualWind = value;
        }
    }
    // Apply a reported state (hub or cloud): it is both what HomeKit shows and what the AC is in.
    applyState(state) {
        for (const code of ['power', 'mode', 'temp', 'wind']) {
            if (state[code] !== undefined) {
                this.acState[code] = state[code];
                this.known[code] = state[code];
            }
        }
        if (state.wind !== undefined) {
            this.rememberManualWind(state.wind);
        }
    }
    saveState() {
        this.accessory.context.irAirConditionerState = { ...this.acState };
        this.accessory.context.irAirConditionerSensors = { ...this.sensors };
    }
    // ---- Commands ----
    async sendACCommands() {
        // Changes made while a sequence is being sent are sent right after it.
        if (this.sending) {
            this.sendPending = true;
            return;
        }
        this.sending = true;
        try {
            const commands = (0, IRAirConditionerHA_1.buildQRCommands)({ ...this.acState }, this.known);
            if (commands.length > 0) {
                this.log.info('Sending IR AC commands: %s', commands.map(c => `${c.code}=${c.value}`).join(', '));
            }
            for (const [index, command] of commands.entries()) {
                if (index > 0) {
                    await new Promise(resolve => setTimeout(resolve, COMMAND_GAP_MS));
                }
                const success = await this.deviceManager.sendCommands(this.device.id, [command]);
                if (success === false) {
                    this.log.warn('Sending IR AC command %s=%s failed.', command.code, command.value);
                    break;
                }
                Object.assign(this.known, (0, IRAirConditionerHA_1.knownStateAfterCommand)(command));
            }
            this.saveState();
        }
        finally {
            this.sending = false;
        }
        if (this.sendPending) {
            this.sendPending = false;
            await this.sendACCommands();
        }
    }
    // ---- State updates ----
    async onDeviceStatusUpdate(status) {
        // Cloud pushes may carry the remote's status codes; treat them as the known state.
        this.applyState((0, IRAirConditionerHA_1.statusToState)(status));
        await super.onDeviceStatusUpdate(status);
    }
    onHubDps(dps) {
        const state = (0, IRAirConditionerHA_1.hubDpsToState)(dps, this.irConfig.hubDps, this.irConfig.currentTemperatureDivisor ?? 10);
        this.applyState(state);
        if (state.currentTemperature !== undefined) {
            this.sensors.currentTemperature = state.currentTemperature;
        }
        if (state.humidity !== undefined) {
            this.sensors.humidity = state.humidity;
        }
        this.saveState();
        this.updateAllValues();
    }
    // ---- Local IR hub ----
    findHub() {
        const devices = this.deviceManager?.devices || [];
        if (this.irConfig.hubId) {
            return devices.find(device => device.id === this.irConfig.hubId);
        }
        const hubs = devices.filter(device => device.isIRControlHub?.() && device.owner_id === this.device.owner_id);
        return hubs.length === 1 ? hubs[0] : undefined;
    }
    async startLocalState() {
        if (this.irConfig.localState === false || this.hubConnection) {
            return;
        }
        const hub = this.findHub();
        let key;
        try {
            const res = await this.deviceManager.api.get('/v1.0/m/life/ha/devices/detail', { devIds: hub.id });
            key = res?.result?.[0]?.local_key;
        }
        catch (error) {
            this.log.debug(`Fetching IR hub details failed: ${error?.message || error}`);
        }
        if (!key) {
            this.log.warn(`Could not get the local key of IR hub ${hub.name}; retrying in ${HUB_RETRY_MS / 1000}s.`);
            setTimeout(() => this.startLocalState(), HUB_RETRY_MS);
            return;
        }
        this.hubConnection = new IRHubLocalConnection_1.default({
            id: hub.id,
            key,
            ip: this.irConfig.hubIp,
            version: this.irConfig.hubProtocolVersion,
        }, this.log);
        this.hubConnection.on('dps', dps => this.onHubDps(dps));
        this.platform.api.on('shutdown', () => this.hubConnection?.stop());
        this.hubConnection.start();
    }
}
exports.default = IRAirConditionerHAAccessory;
