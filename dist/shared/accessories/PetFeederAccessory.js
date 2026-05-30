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
        this.configureQuickFeed();
        this.configureManualFeed();
        this.configureSlowFeed();
        this.configureFeedState();
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
            // quick_feed/manual_feed are momentary actions.  Always display them as off.
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
    configureManualFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.MANUAL_FEED);
        const { manualFeedAmount } = this.getPetFeederConfig();
        this.configureActionSwitch(schema, `${this.device?.name || 'Pet Feeder'} Manual Feed`, 'manual_feed', async () => {
            await this.sendCommands([{ code: schema.code, value: manualFeedAmount }], true);
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
            const value = this.getStatus(schema.code)?.value;
            return value === 'feeding' ? OCCUPANCY_DETECTED : OCCUPANCY_NOT_DETECTED;
        });
    }
}
exports.default = PetFeederAccessory;
//# sourceMappingURL=PetFeederAccessory.js.map
