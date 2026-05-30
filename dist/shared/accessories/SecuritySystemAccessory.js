"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Name_1 = require("./characteristic/Name");
const SCHEMA_CODE = {
    MASTER_MODE: ['master_mode'],
    MASTER_STATE: ['master_state'],
    SOS_STATE: ['sos_state'],
    TAMPER_ALARM: ['temper_alarm', 'tamper_alarm'],
    ALARM_SOUND: ['switch_alarm_sound'],
    MUFFLING: ['muffling'],
    ALARM_CALL: ['switch_alarm_call'],
    ALARM_SMS: ['switch_alarm_sms'],
    ALARM_PROPEL: ['switch_alarm_propel'],
    LOW_BATTERY_ALERT: ['switch_low_battery'],
    MODE_DELAY_SOUND: ['switch_mode_dl_sound'],
};
class SecuritySystemAccessory extends BaseAccessory_1.default {
    constructor() {
        super(...arguments);
        this.isNightArm = false;
    }
    requiredSchema() {
        // Some Tuya alarm panels expose master_mode + master_state, but not sos_state.
        return [SCHEMA_CODE.MASTER_MODE];
    }
    getAlarmConfig() {
        const config = this.device ? this.platform.getDeviceConfig(this.device) : undefined;
        const alarm = (config && typeof config.alarm === 'object') ? config.alarm : {};
        return {
            exposeAlarmSoundSwitch: !!alarm.exposeAlarmSoundSwitch,
            exposeMufflingSwitch: !!alarm.exposeMufflingSwitch,
            exposeNotificationSwitches: !!alarm.exposeNotificationSwitches,
        };
    }
    configureServices() {
        const service = this.accessory.getService(this.Service.SecuritySystem)
            || this.accessory.addService(this.Service.SecuritySystem);
        (0, Name_1.configureName)(this, service, this.device.name);
        this.configureCurrentState(service);
        this.configureTargetState(service);
        this.configureTamper(service);
        this.configureExtraSwitches();
    }
    mapTuyaModeToHomeKit(value, current = true) {
        const Current = this.Characteristic.SecuritySystemCurrentState;
        const Target = this.Characteristic.SecuritySystemTargetState;
        const map = current ? {
            disarmed: Current.DISARMED,
            arm: Current.AWAY_ARM,
            home: this.isNightArm ? Current.NIGHT_ARM : Current.STAY_ARM,
            sos: Current.ALARM_TRIGGERED,
        } : {
            disarmed: Target.DISARM,
            arm: Target.AWAY_ARM,
            home: this.isNightArm ? Target.NIGHT_ARM : Target.STAY_ARM,
            sos: Target.AWAY_ARM,
        };
        return map[value] ?? (current ? Current.DISARMED : Target.DISARM);
    }
    mapHomeKitTargetToTuya(value) {
        const Target = this.Characteristic.SecuritySystemTargetState;
        switch (value) {
            case Target.DISARM:
                return 'disarmed';
            case Target.STAY_ARM:
            case Target.NIGHT_ARM:
                return 'home';
            case Target.AWAY_ARM:
            default:
                return 'arm';
        }
    }
    isAlarmTriggered() {
        const masterStateSchema = this.getSchema(...SCHEMA_CODE.MASTER_STATE);
        if (masterStateSchema && this.getStatus(masterStateSchema.code)?.value === 'alarm') {
            return true;
        }
        const sosStateSchema = this.getSchema(...SCHEMA_CODE.SOS_STATE);
        if (sosStateSchema && this.getStatus(sosStateSchema.code)?.value) {
            return true;
        }
        const masterModeSchema = this.getSchema(...SCHEMA_CODE.MASTER_MODE);
        if (masterModeSchema && this.getStatus(masterModeSchema.code)?.value === 'sos') {
            return true;
        }
        return false;
    }
    configureCurrentState(service) {
        const masterModeSchema = this.getSchema(...SCHEMA_CODE.MASTER_MODE);
        service.getCharacteristic(this.Characteristic.SecuritySystemCurrentState)
            .onGet(() => {
            this.checkOnlineStatus();
            if (this.isAlarmTriggered()) {
                return this.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
            }
            return this.mapTuyaModeToHomeKit(this.getStatus(masterModeSchema.code)?.value, true);
        });
    }
    configureTargetState(service) {
        const masterModeSchema = this.getSchema(...SCHEMA_CODE.MASTER_MODE);
        service.getCharacteristic(this.Characteristic.SecuritySystemTargetState)
            .onGet(() => {
            this.checkOnlineStatus();
            return this.mapTuyaModeToHomeKit(this.getStatus(masterModeSchema.code)?.value, false);
        })
            .onSet(async (value) => {
            this.isNightArm = value === this.Characteristic.SecuritySystemTargetState.NIGHT_ARM;
            const commands = [{ code: masterModeSchema.code, value: this.mapHomeKitTargetToTuya(value) }];
            const sosStateSchema = this.getSchema(...SCHEMA_CODE.SOS_STATE);
            if (sosStateSchema && value === this.Characteristic.SecuritySystemTargetState.DISARM) {
                commands.push({ code: sosStateSchema.code, value: false });
            }
            await this.sendCommands(commands, true);
        });
    }
    configureTamper(service) {
        const schema = this.getSchema(...SCHEMA_CODE.TAMPER_ALARM);
        if (!schema) {
            return;
        }
        if (!service.testCharacteristic(this.Characteristic.StatusTampered)) {
            service.addOptionalCharacteristic(this.Characteristic.StatusTampered);
        }
        const { TAMPERED, NOT_TAMPERED } = this.Characteristic.StatusTampered;
        service.getCharacteristic(this.Characteristic.StatusTampered)
            .onGet(() => {
            this.checkOnlineStatus();
            return this.getStatus(schema.code)?.value ? TAMPERED : NOT_TAMPERED;
        });
    }
    configureExtraSwitches() {
        const config = this.getAlarmConfig();
        if (config.exposeAlarmSoundSwitch) {
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.ALARM_SOUND), `${this.device.name} Alarm Sound`, 'switch_alarm_sound');
        }
        if (config.exposeMufflingSwitch) {
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.MUFFLING), `${this.device.name} Mute`, 'muffling');
        }
        if (config.exposeNotificationSwitches) {
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.ALARM_CALL), `${this.device.name} Alarm Call`, 'switch_alarm_call');
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.ALARM_SMS), `${this.device.name} Alarm SMS`, 'switch_alarm_sms');
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.ALARM_PROPEL), `${this.device.name} App Push`, 'switch_alarm_propel');
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.LOW_BATTERY_ALERT), `${this.device.name} Low Battery Alert`, 'switch_low_battery');
            this.configureBooleanSwitch(this.getSchema(...SCHEMA_CODE.MODE_DELAY_SOUND), `${this.device.name} Mode Delay Sound`, 'switch_mode_dl_sound');
        }
    }
    configureBooleanSwitch(schema, name, subtype) {
        if (!schema) {
            return;
        }
        const service = this.accessory.getServiceById(this.Service.Switch, subtype)
            || this.accessory.addService(this.Service.Switch, name, subtype);
        (0, Name_1.configureName)(this, service, name);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => {
            this.checkOnlineStatus();
            return !!(this.getStatus(schema.code)?.value ?? false);
        })
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: !!value }], true);
        });
    }
}
exports.default = SecuritySystemAccessory;
//# sourceMappingURL=SecuritySystemAccessory.js.map
