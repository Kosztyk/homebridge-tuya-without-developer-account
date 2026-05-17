"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const SCHEMA_CODE = {
    STATE: ['shock_state'],
};
class VibrationSensorAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [SCHEMA_CODE.STATE];
    }
    configureServices() {
        this.getMotionService().setCharacteristic(this.Characteristic.MotionDetected, false);
    }
    getMotionService() {
        return this.accessory.getService(this.Service.MotionSensor)
            || this.accessory.addService(this.Service.MotionSensor);
    }
    async onDeviceStatusUpdate(status) {
        super.onDeviceStatusUpdate(status);
        const motionSchema = this.getSchema(...SCHEMA_CODE.STATE);
        const motionStatus = status.find(_status => _status.code === motionSchema.code);
        if (motionStatus) {
            this.onMotionDetected(motionStatus);
        }
    }
    onMotionDetected(status) {
        if (!this.initialized) {
            return;
        }
        if (status.value !== 'vibration' && status.value !== 'drop') {
            return;
        }
        this.log.info('Motion event:', status.value);
        const characteristic = this.getMotionService().getCharacteristic(this.Characteristic.MotionDetected);
        characteristic.updateValue(true);
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => characteristic.updateValue(false), 3 * 1000);
    }
}
exports.default = VibrationSensorAccessory;
//# sourceMappingURL=VibrationSensorAccessory.js.map