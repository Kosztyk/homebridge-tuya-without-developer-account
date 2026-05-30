"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Name_1 = require("./characteristic/Name");
const SCHEMA_CODE = {
    QUICK_FEED: ['quick_feed'],
    SLOW_FEED: ['slow_feed'],
    MANUAL_FEED: ['manual_feed'],
    FEED_STATE: ['feed_state'],
};
class PetFeederAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        // Tuya pet feeders often do not expose a generic "switch" DP.  A feeder is
        // considered supported when it has at least one command DP we can expose.
        return [[...SCHEMA_CODE.QUICK_FEED, ...SCHEMA_CODE.MANUAL_FEED, ...SCHEMA_CODE.SLOW_FEED]];
    }
    getPetFeederConfig() {
        const config = this.device ? this.platform.getDeviceConfig(this.device) : undefined;
        const feeder = (config && typeof config.petFeeder === 'object') ? config.petFeeder : {};
        const manualFeedAmount = Number(feeder.manualFeedAmount);
        return {
            manualFeedAmount: Number.isFinite(manualFeedAmount) ? Math.max(1, Math.min(12, Math.round(manualFeedAmount))) : 1,
            exposeSlowFeed: feeder.exposeSlowFeed !== false,
        };
    }
    configureServices() {
        this.configureFeedNowValve();
        this.configureQuickFeed();
        this.configureSlowFeed();
        this.configureFeedState();
        this.removeLegacyManualFeedSwitch();
    }
    isFeeding() {
        const schema = this.getSchema(...SCHEMA_CODE.FEED_STATE);
        if (!schema) {
            return false;
        }
        const status = this.getStatus(schema.code);
        if (!status) {
            return false;
        }
        const value = status.value;
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            return value > 0;
        }
        const text = String(value ?? '').trim().toLowerCase();
        if (!text) {
            return false;
        }
        return !['0', 'false', 'idle', 'standby', 'normal', 'done', 'finish', 'finished', 'complete', 'completed', 'none', 'ready'].includes(text);
    }
    getFeedNowCommand() {
        const manualSchema = this.getSchema(...SCHEMA_CODE.MANUAL_FEED);
        if (manualSchema) {
            const { manualFeedAmount } = this.getPetFeederConfig();
            return [{ code: manualSchema.code, value: manualFeedAmount }];
        }
        const quickSchema = this.getSchema(...SCHEMA_CODE.QUICK_FEED);
        if (quickSchema) {
            return [{ code: quickSchema.code, value: true }];
        }
        return undefined;
    }
    configureFeedNowValve() {
        const commands = this.getFeedNowCommand();
        if (!commands) {
            return;
        }
        const name = `${this.device?.name || 'Pet Feeder'} Feed Now`;
        const service = this.accessory.getServiceById(this.Service.Valve, 'feed_now')
            || this.accessory.addService(this.Service.Valve, name, 'feed_now');
        (0, Name_1.configureName)(this, service, name);
        const valveType = this.Characteristic.ValveType.GENERIC_VALVE ?? this.Characteristic.ValveType.IRRIGATION;
        service.setCharacteristic(this.Characteristic.ValveType, valveType);
        const { ACTIVE, INACTIVE } = this.Characteristic.Active;
        const { IN_USE, NOT_IN_USE } = this.Characteristic.InUse;
        service.getCharacteristic(this.Characteristic.Active)
            .onGet(() => {
            this.checkOnlineStatus();
            return this.isFeeding() ? ACTIVE : INACTIVE;
        })
            .onSet(async (value) => {
            this.checkOnlineStatus();
            if (value === ACTIVE) {
                await this.sendCommands(commands, true);
                service.getCharacteristic(this.Characteristic.Active).updateValue(ACTIVE);
                service.getCharacteristic(this.Characteristic.InUse).updateValue(IN_USE);
                setTimeout(() => {
                    if (!this.isFeeding()) {
                        service.getCharacteristic(this.Characteristic.Active).updateValue(INACTIVE);
                        service.getCharacteristic(this.Characteristic.InUse).updateValue(NOT_IN_USE);
                    }
                }, 2500);
            }
            else {
                // Tuya pet feeders usually expose manual_feed/quick_feed as momentary actions,
                // not cancellable feed sessions.  Show HomeKit as inactive but do not send a
                // fake cancel command that the device does not support.
                service.getCharacteristic(this.Characteristic.Active).updateValue(INACTIVE);
                if (!this.isFeeding()) {
                    service.getCharacteristic(this.Characteristic.InUse).updateValue(NOT_IN_USE);
                }
            }
        });
        service.getCharacteristic(this.Characteristic.InUse)
            .onGet(() => {
            this.checkOnlineStatus();
            return this.isFeeding() ? IN_USE : NOT_IN_USE;
        });
    }
    configureActionSwitch(schema, name, subtype, onSet) {
        if (!schema) {
            return;
        }
        const service = this.accessory.getServiceById(this.Service.Switch, subtype)
            || this.accessory.addService(this.Service.Switch, name, subtype);
        (0, Name_1.configureName)(this, service, name);
        service.getCharacteristic(this.Characteristic.On)
            .onGet(() => {
            this.checkOnlineStatus();
            // quick_feed is a momentary action. Always display it as off.
            return false;
        })
            .onSet(async (value) => {
            if (value) {
                await onSet();
            }
            setTimeout(() => service.getCharacteristic(this.Characteristic.On).updateValue(false), 500);
        });
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
    configureQuickFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.QUICK_FEED);
        this.configureActionSwitch(schema, `${this.device?.name || 'Pet Feeder'} Quick Feed`, 'quick_feed', async () => {
            await this.sendCommands([{ code: schema.code, value: true }], true);
        });
    }
    configureSlowFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.SLOW_FEED);
        const { exposeSlowFeed } = this.getPetFeederConfig();
        if (!exposeSlowFeed) {
            return;
        }
        this.configureBooleanSwitch(schema, `${this.device?.name || 'Pet Feeder'} Slow Feed`, 'slow_feed');
    }
    configureFeedState() {
        const schema = this.getSchema(...SCHEMA_CODE.FEED_STATE);
        if (!schema) {
            return;
        }
        const service = this.accessory.getServiceById(this.Service.OccupancySensor, 'feed_state')
            || this.accessory.addService(this.Service.OccupancySensor, `${this.device?.name || 'Pet Feeder'} Feeding`, 'feed_state');
        (0, Name_1.configureName)(this, service, `${this.device?.name || 'Pet Feeder'} Feeding`);
        const { OCCUPANCY_DETECTED, OCCUPANCY_NOT_DETECTED } = this.Characteristic.OccupancyDetected;
        service.getCharacteristic(this.Characteristic.OccupancyDetected)
            .onGet(() => {
            this.checkOnlineStatus();
            return this.isFeeding() ? OCCUPANCY_DETECTED : OCCUPANCY_NOT_DETECTED;
        });
    }
    removeLegacyManualFeedSwitch() {
        const service = this.accessory.getServiceById(this.Service.Switch, 'manual_feed');
        if (service) {
            this.log.warn(`Removing old pet feeder Manual Feed switch from cache: ${service.displayName}`);
            this.accessory.removeService(service);
        }
    }
}
exports.default = PetFeederAccessory;
//# sourceMappingURL=PetFeederAccessory.js.map
