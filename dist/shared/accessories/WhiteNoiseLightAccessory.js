"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const On_1 = require("./characteristic/On");
const Light_1 = require("./characteristic/Light");
const SCHEMA_CODE = {
    LIGHT_ON: ['switch_led'],
    LIGHT_COLOR: ['colour_data'],
    MUSIC_ON: ['switch_music'],
};
class WhiteNoiseLightAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.LIGHT_ON, SCHEMA_CODE.MUSIC_ON];
    }
    configureServices() {
        // Light
        if (this.lightServiceType() === this.Service.Lightbulb) {
            (0, Light_1.configureLight)(this, this.lightService(), this.getSchema(...SCHEMA_CODE.LIGHT_ON), undefined, undefined, this.lightColorSchema(), undefined);
        }
        else if (this.lightServiceType() === this.Service.Switch) {
            (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.LIGHT_ON));
            const unusedService = this.accessory.getService(this.Service.Lightbulb);
            unusedService && this.accessory.removeService(unusedService);
        }
        // White Noise
        (0, On_1.configureOn)(this, undefined, this.getSchema(...SCHEMA_CODE.MUSIC_ON));
    }
    lightColorSchema() {
        const colorSchema = this.getSchema(...SCHEMA_CODE.LIGHT_COLOR);
        if (!colorSchema) {
            return;
        }
        const { h, s, v } = (colorSchema.property || {});
        if (!h || !s || !v) {
            // Set sensible defaults for missing properties
            colorSchema.property = {
                h: { min: 0, scale: 0, unit: '', max: 360, step: 1 },
                s: { min: 0, scale: 0, unit: '', max: 1000, step: 1 },
                v: { min: 0, scale: 0, unit: '', max: 1000, step: 1 },
            };
        }
        return colorSchema;
    }
    lightServiceType() {
        if (this.lightColorSchema()) {
            return this.Service.Lightbulb;
        }
        return this.Service.Switch;
    }
    lightService() {
        return (this.accessory.getService(this.Service.Lightbulb) ||
            this.accessory.addService(this.Service.Lightbulb));
    }
}
exports.default = WhiteNoiseLightAccessory;
//# sourceMappingURL=WhiteNoiseLightAccessory.js.map