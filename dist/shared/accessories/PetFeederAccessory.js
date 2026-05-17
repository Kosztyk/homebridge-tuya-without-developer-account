"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Active_1 = require("./characteristic/Active");
const SCHEMA_CODE = {
    ACTIVE: ['switch'],
    LIGHT: ['light'],
    QUICK_FEED: ['quick_feed'],
    SLOW_FEED: ['slow_feed'],
    MANUAL_FEED: ['manual_feed'],
    MEAL_PLAN: ['meal_plan'],
    BATTERY_PERCENTAGE: ['battery_percentage'],
    FEED_REPORT: ['feed_report'],
    FEED_STATE: ['feed_state'],
};
class PetFeederAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.ACTIVE];
    }
    configureServices() {
        (0, Active_1.configureActive)(this, this.mainService(), this.getSchema(...SCHEMA_CODE.ACTIVE));
        this.configureLight();
        this.configureQuickFeed();
        this.configureSlowFeed();
        this.configureManualFeed();
        this.configureMealPlan();
        this.configureBatteryPercentage();
        this.configureFeedReport();
        this.configureFeedState();
    }
    mainService() {
        return this.accessory.getService(this.Service.Switch)
            || this.accessory.addService(this.Service.Switch);
    }
    configureLight() {
        const schema = this.getSchema(...SCHEMA_CODE.LIGHT);
        if (!schema) {
            this.log.warn('Light is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.On)
            .onSet(async (value) => {
            await this.sendCommands([{ code: schema.code, value: value }]);
        });
    }
    configureQuickFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.QUICK_FEED);
        if (!schema) {
            this.log.warn('Quick feed is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.On)
            .onSet(async (value) => {
            if (value) {
                await this.sendCommands([{ code: schema.code, value: true }]);
            }
        });
    }
    configureSlowFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.SLOW_FEED);
        if (!schema) {
            this.log.warn('Slow feed is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.On)
            .onSet(async (value) => {
            if (value) {
                await this.sendCommands([{ code: schema.code, value: true }]);
            }
        });
    }
    configureManualFeed() {
        const schema = this.getSchema(...SCHEMA_CODE.MANUAL_FEED);
        if (!schema) {
            this.log.warn('Manual feed is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.On)
            .onSet(async (value) => {
            if (value) {
                await this.sendCommands([{ code: schema.code, value: 1 }]);
            }
        });
    }
    configureMealPlan() {
        const schema = this.getSchema(...SCHEMA_CODE.MEAL_PLAN);
        if (!schema) {
            this.log.warn('Meal plan is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.On)
            .onSet(async (value) => {
            if (value) {
                await this.sendCommands([{ code: schema.code, value: value }]);
            }
        });
    }
    configureBatteryPercentage() {
        const schema = this.getSchema(...SCHEMA_CODE.BATTERY_PERCENTAGE);
        if (!schema) {
            this.log.warn('Battery percentage is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.BatteryLevel)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value;
        });
    }
    configureFeedReport() {
        const schema = this.getSchema(...SCHEMA_CODE.FEED_REPORT);
        if (!schema) {
            this.log.warn('Feed report is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.StatusActive)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value;
        });
    }
    configureFeedState() {
        const schema = this.getSchema(...SCHEMA_CODE.FEED_STATE);
        if (!schema) {
            this.log.warn('Feed state is not supported.');
            return;
        }
        this.mainService().getCharacteristic(this.Characteristic.StatusActive)
            .onGet(() => {
            const status = this.getStatus(schema.code);
            return status.value === 'feeding';
        });
    }
}
exports.default = PetFeederAccessory;
//# sourceMappingURL=PetFeederAccessory.js.map