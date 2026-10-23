"use strict";
const IRAC = require('./IRAirConditionerAccessory').default;
const IRHubLocalConnection = require('../util/IRHubLocalConnection');
const { configureName } = require('./characteristic/Name');
const { POWER_OFF, POWER_ON, AC_MODE, FAN_SPEED, DEFAULT_TEMP_RANGE, buildKeyRange, buildQRCommands, knownStateAfterCommand, statusToState, hubDpsToState } = require('../util/IRAirConditionerHA');
const COMMAND_GAP_MS = 500;
const HUB_RETRY_MS = 60000;
const FAN_SPEED_SUBTYPE = 'ir_ac_fan_speed';
const FAN_AUTO_SUBTYPE = 'ir_ac_fan_auto';
const IR_HUB_CATEGORIES = new Set(['wnykq', 'hwktwkq', 'wsdykq']);

/** IR remotes use QR cloud for writes, and an optional local AC hub for real state. */
class IRAirConditionerHAAccessory extends IRAC {
  constructor(platform, accessory) {
    super(platform, accessory);
    this.irConfig = platform.getDeviceConfig?.(this.device)?.irAirConditioner || {};
    this.separateDryAndFanServices = this.irConfig.dryAndFanModes !== false;
    const [min,max] = this.getTempRange(AC_MODE.COOL) || DEFAULT_TEMP_RANGE;
    this.acState = { power: POWER_OFF, mode: AC_MODE.COOL, temp: Math.round((min+max)/2), wind: FAN_SPEED.AUTO, ...(accessory.context.irAirConditionerState || {}) };
    this.known = { ...this.acState };
    this.sensors = { ...(accessory.context.irAirConditionerSensors || {}) };
    this.hubConnection = undefined;
    this.retryTimer = undefined;
    this.stopped = false;
    this.commandQueue = Promise.resolve();
    this.lastHubReportAt = 0;
    this.platform.api.on('shutdown', () => this.stop());
  }
  get device() {
    const device = super.device;
    if (device && !device.remote_keys) {
      const config = this.platform.getDeviceConfig?.(device) || {};
      const maxMode = config.irAirConditioner?.dryAndFanModes === false ? AC_MODE.AUTO : AC_MODE.DEHUMIDIFIER;
      // The existing AC implementation expects remote_keys. Derive it only for this IR category.
      device.remote_keys = { category_id: 5, key_range: buildKeyRange(device.schema, config.airConditioner, maxMode) };
    }
    return device;
  }
  getParentAccessory() { return this; }
  fanService() {
    if (this.supportFan()) return super.fanService();
    // Parent's Active handler accesses Fan even when a separate Fan service is hidden.
    this.unusedFanService = this.unusedFanService || new this.Service.Fanv2('IR AC hidden helper');
    return this.unusedFanService;
  }
  configureServices() {
    // Migration from the contributor's original IR AC branch. Remove only the two
    // legacy services on this IR AC accessory, before the parent resolves services.
    // Otherwise cached old Fanv2 can be selected in place of the current service.
    this.removeServiceById(this.Service.Fanv2, 'fan_speed');
    this.removeServiceById(this.Service.Switch, 'fan_auto');
    this.primeThresholdValues();
    super.configureServices();
    this.configureCurrentState();
    if (!this.separateDryAndFanServices) {
      this.removeParentServices(this.Service.HumidifierDehumidifier, this.Service.Fanv2);
      this.configureActiveInAllModes();
      this.configureManualFanService();
    }
    if (this.irConfig.fanAutoSwitch !== false) this.configureFanAutoSwitch();
    else this.removeServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE);
    if (this.irConfig.localState !== false && this.findHub()) {
      this.configureHumiditySensor();
      void this.startLocalState();
    }
    this.configureServiceNames();
    this.wrapHomeKitWrites();
  }
  primeThresholdValues() {
    for (const [mode,type] of [[AC_MODE.HEAT,this.Characteristic.HeatingThresholdTemperature], [AC_MODE.COOL,this.Characteristic.CoolingThresholdTemperature]]) {
      if (this.getKeyRangeItem(mode)) this.mainService().getCharacteristic(type).updateValue(this.getTemp());
    }
  }
  configureCurrentState() {
    const { INACTIVE, IDLE, HEATING, COOLING } = this.Characteristic.CurrentHeaterCoolerState;
    this.mainService().getCharacteristic(this.Characteristic.CurrentHeaterCoolerState).onGet(() => {
      if (this.getPower() !== POWER_ON) return INACTIVE;
      // Requested heating/cooling mode is not proof that the compressor is active.
      const current = this.sensors.currentTemperature;
      if (!Number.isFinite(current)) return IDLE;
      if (this.getMode() === AC_MODE.COOL) return current > this.getTemp() ? COOLING : IDLE;
      if (this.getMode() === AC_MODE.HEAT) return current < this.getTemp() ? HEATING : IDLE;
      if (this.getMode() === AC_MODE.AUTO) return current > this.getTemp() ? COOLING : current < this.getTemp() ? HEATING : IDLE;
      return IDLE;
    });
  }
  configureCurrentTemperature() {
    this.mainService().getCharacteristic(this.Characteristic.CurrentTemperature).onGet(() => this.sensors.currentTemperature ?? this.getTemp());
  }
  configureActiveInAllModes() {
    const { ACTIVE, INACTIVE } = this.Characteristic.Active;
    this.mainService().getCharacteristic(this.Characteristic.Active)
      .onGet(() => this.getPower() === POWER_ON ? ACTIVE : INACTIVE)
      .onSet(async v => this.setPower(v === ACTIVE ? POWER_ON : POWER_OFF));
  }
  configureRotationSpeed(service) {
    service.getCharacteristic(this.Characteristic.RotationSpeed)
      .onGet(() => this.getWind() === FAN_SPEED.AUTO ? this.lastManualWind() : this.getWind())
      .onSet(async v => { if (v !== 0) this.setWind(v); })
      .setProps({ minValue: 0, maxValue: 3, minStep: 1 });
  }
  configureManualFanService() {
    const { ACTIVE, INACTIVE } = this.Characteristic.Active;
    const svc = this.accessory.getServiceById(this.Service.Fanv2, FAN_SPEED_SUBTYPE)
      || this.accessory.addService(this.Service.Fanv2, `${this.accessory.displayName} Fan Speed`, FAN_SPEED_SUBTYPE);
    const manual = () => this.getPower() === POWER_ON && this.getWind() !== FAN_SPEED.AUTO;
    svc.getCharacteristic(this.Characteristic.Active)
      .onGet(() => manual() ? ACTIVE : INACTIVE)
      .onSet(async v => { if (v !== ACTIVE) this.setWind(FAN_SPEED.AUTO); else { if (this.getWind() === FAN_SPEED.AUTO) this.setWind(this.lastManualWind()); this.powerOn(); } });
    svc.getCharacteristic(this.Characteristic.RotationSpeed)
      .onGet(() => manual() ? this.getWind() : 0)
      .onSet(async v => { if (v === 0) { this.setWind(FAN_SPEED.AUTO); return; } this.setWind(v); this.powerOn(); })
      .setProps({ minValue: 0, maxValue: 3, minStep: 1 });
    this.configureTargetFanState(svc);
  }
  configureTargetFanState(service) {
    const { MANUAL, AUTO } = this.Characteristic.TargetFanState;
    service.getCharacteristic(this.Characteristic.TargetFanState)
      .onGet(() => this.getWind() === FAN_SPEED.AUTO ? AUTO : MANUAL)
      .onSet(async v => this.setWind(v === AUTO ? FAN_SPEED.AUTO : this.lastManualWind()));
  }
  configureFanAutoSwitch() {
    const svc = this.accessory.getServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE)
      || this.accessory.addService(this.Service.Switch, `${this.accessory.displayName} Fan Auto`, FAN_AUTO_SUBTYPE);
    svc.getCharacteristic(this.Characteristic.On)
      .onGet(() => this.getWind() === FAN_SPEED.AUTO)
      .onSet(async v => this.setWind(v ? FAN_SPEED.AUTO : this.lastManualWind()));
  }
  configureHumiditySensor() {
    const svc = this.accessory.getService(this.Service.HumiditySensor)
      || this.accessory.addService(this.Service.HumiditySensor, `${this.accessory.displayName} Humidity`);
    // Never fabricate a 0% humidity reading while the hub is offline or has not reported yet.
    svc.getCharacteristic(this.Characteristic.CurrentRelativeHumidity).onGet(() => {
      if (!this.hubConnection?.connected || !Number.isFinite(this.sensors.humidity)) {
        throw new this.platform.api.hap.HapStatusError(-70402);
      }
      return this.sensors.humidity;
    });
  }
  configureStatusActive() {
    super.configureStatusActive();
    const humidity = this.accessory.getService(this.Service.HumiditySensor);
    if (humidity) humidity.getCharacteristic(this.Characteristic.StatusActive)
      .onGet(() => Boolean(this.hubConnection?.connected && this.lastHubReportAt > 0));
  }
  configureServiceNames() {
    const names = this.irConfig.names || {};
    const base = this.device?.name || this.accessory.displayName;
    const main = this.mainService();
    main.setPrimaryService(true);
    const list = [
      [main, base, names.airConditioner],
      [this.accessory.getServiceById(this.Service.Fanv2, FAN_SPEED_SUBTYPE), `${base} Fan Speed`, names.fanSpeed],
      [this.accessory.getServiceById(this.Service.Switch, FAN_AUTO_SUBTYPE), `${base} Fan Auto`, names.fanAuto],
      [this.accessory.getService(this.Service.HumiditySensor), `${base} Humidity`, names.humidity],
    ];
    for (const [service, fallback, overrideName] of list) if (service) configureName(this, service, fallback, { overrideName });
  }
  removeParentServices(...types) {
    for (const type of types) for (const svc of [...this.accessory.services]) {
      if (svc.UUID === type.UUID && svc.subtype !== FAN_SPEED_SUBTYPE) this.accessory.removeService(svc);
    }
  }
  removeServiceById(type, subtype) { const svc = this.accessory.getServiceById(type,subtype); if (svc) this.accessory.removeService(svc); }
  getPower() { return this.acState.power; }
  getMode() { return this.acState.mode; }
  getTemp() { return this.acState.temp; }
  getWind() { return this.acState.wind; }
  setPower(v) { this.acState.power = v; }
  setMode(v) { this.acState.mode = v; }
  setTemp(v) { this.acState.temp = v; }
  setWind(v) { this.acState.wind = v; if (v !== FAN_SPEED.AUTO) this.acState.lastManualWind = v; }
  powerOn() { if (this.getPower() !== POWER_ON) this.setPower(POWER_ON); }
  lastManualWind() { return this.acState.lastManualWind || FAN_SPEED.LOW; }
  saveState() {
    this.accessory.context.irAirConditionerState = { ...this.acState };
    this.accessory.context.irAirConditionerSensors = { ...this.sensors };
  }
  applyState(state) {
    for (const k of ['power','mode','temp','wind']) if (state[k] !== undefined) { this.acState[k] = state[k]; this.known[k] = state[k]; }
    if (state.wind !== undefined && state.wind !== FAN_SPEED.AUTO) this.acState.lastManualWind = state.wind;
    if (state.currentTemperature !== undefined) this.sensors.currentTemperature = state.currentTemperature;
    if (state.humidity !== undefined) this.sensors.humidity = state.humidity;
    this.saveState();
  }
  /**
   * Parent HomeKit handlers are async but only update state synchronously. Wrap them on this
   * accessory to await the actual QR commands; a cloud refusal then becomes a HAP write error.
   * No existing device handlers or services are touched.
   */
  wrapHomeKitWrites() {
    for (const svc of this.accessory.services) for (const ch of svc.characteristics) {
      const original = ch.setHandler;
      if (typeof original !== 'function' || ch._tuyaIrWriteWrapped) continue;
      ch._tuyaIrWriteWrapped = true;
      ch.onSet(async value => {
        await original(value);
        // Serialize all writes; latest desired state wins while commands are in flight.
        const operation = this.commandQueue.then(() => this.sendACCommands());
        this.commandQueue = operation.catch(() => {});
        await operation;
      });
    }
  }
  async sendACCommands() {
    const commands = buildQRCommands({ ...this.acState }, this.known);
    if (!commands.length) { this.saveState(); return; }
    this.log.info('Sending IR AC commands: %s', commands.map(c => `${c.code}=${c.value}`).join(', '));
    try {
      for (const [index, command] of commands.entries()) {
        if (index) await new Promise(resolve => setTimeout(resolve, COMMAND_GAP_MS));
        const result = await this.deviceManager.sendCommands(this.device.id, [command]);
        if (result === false) throw new Error(`Tuya QR rejected ${command.code}=${command.value}`);
        Object.assign(this.known, knownStateAfterCommand(command));
      }
      this.saveState();
    } catch (error) {
      // Reconcile a partial command sequence back to the last accepted state.
      Object.assign(this.acState, this.known);
      this.saveState();
      void this.updateAllValues().catch(e => this.log.debug(`IR AC refresh failed: ${e.message}`));
      this.log.warn(`IR AC command failed: ${error?.message || error}`);
      const HAP = this.platform.api.hap;
      if (HAP?.HapStatusError) throw new HAP.HapStatusError(-70402);
      throw error;
    }
  }
  async onDeviceStatusUpdate(status) {
    const state = statusToState(status);
    // The QR cloud's IR power only follows QR commands. Physical remotes can
    // change the AC power independently; the connected LAN hub is authoritative.
    // Still ingest QR mode, temperature and fan updates when the hub is online.
    // Fall back to QR power when LAN feedback is absent/disconnected.
    if (this.hubConnection?.connected) delete state.power;
    this.applyState(state);
    await super.onDeviceStatusUpdate(status);
  }
  onHubDps(dps) {
    if (this.stopped) return;
    this.lastHubReportAt = Date.now();
    this.applyState(hubDpsToState(dps, this.irConfig.hubDps, this.irConfig.currentTemperatureDivisor ?? 10));
    void this.updateAllValues().catch(e => this.log.debug(`IR hub state refresh failed: ${e.message}`));
  }
  findHub() {
    const devices = this.deviceManager?.devices || [];
    // hubId is an explicit user selection. Do not reject it because a category
    // override changed the hub's HomeKit presentation to `hidden`.
    if (this.irConfig.hubId) {
      return devices.find(dev => String(dev.id) === String(this.irConfig.hubId));
    }
    // Auto-detection must still enforce hub type + home, but use the Tuya
    // category captured before Homebridge presentation overrides were applied.
    const ownerId = String(this.device?.owner_id ?? '');
    const hubs = devices.filter(dev => {
      const category = String(dev.original_category || dev.category || '').toLowerCase();
      return IR_HUB_CATEGORIES.has(category) && String(dev.owner_id ?? '') === ownerId;
    });
    return hubs.length === 1 ? hubs[0] : undefined;
  }
  scheduleHubRetry() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.startLocalState(); }, HUB_RETRY_MS);
    this.retryTimer.unref?.();
  }
  async startLocalState() {
    if (this.stopped || this.irConfig.localState === false || this.hubConnection) return;
    const hub = this.findHub(); if (!hub) return;
    let key;
    try {
      const res = await this.deviceManager.api.get('/v1.0/m/life/ha/devices/detail', { devIds: hub.id });
      if (res?.success && Array.isArray(res.result)) key = res.result[0]?.local_key;
    } catch (error) { this.log.debug(`[IR hub] Device details unavailable: ${error?.message || error}`); }
    if (this.stopped) return;
    if (!key) { this.log.warn('[IR hub] Local key unavailable; local state retry scheduled.'); this.scheduleHubRetry(); return; }
    this.hubConnection = new IRHubLocalConnection({ id: hub.id, key, ip: this.irConfig.hubIp, version: this.irConfig.hubProtocolVersion }, this.log);
    this.hubConnection.on('dps', dps => this.onHubDps(dps));
    this.hubConnection.start();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    this.hubConnection?.stop();
  }
}
module.exports = IRAirConditionerHAAccessory;
