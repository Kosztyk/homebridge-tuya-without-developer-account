"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TuyaStreamDelegate_1 = require("../util/TuyaStreamDelegate");
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const Light_1 = require("./characteristic/Light");
const On_1 = require("./characteristic/On");
const ProgrammableSwitchEvent_1 = require("./characteristic/ProgrammableSwitchEvent");
const SCHEMA_CODE = {
    MOTION_ON: ['motion_switch'],
    MOTION_DETECT: ['movement_detect_pic'],
    // Indicates that this is possibly a doorbell
    DOORBELL: ['doorbell_ring_exist'],
    // Notifies when a doorbell ring occurs.
    DOORBELL_RING: ['doorbell_pic'],
    // Notifies when a doorbell ring occurs.
    ALARM_MESSAGE: ['alarm_message'],
    LIGHT_ON: ['floodlight_switch'],
    LIGHT_BRIGHT: ['floodlight_lightness'],
};
class CameraAccessory extends BaseAccessory_1.default {
    requiredSchema() {
        return [];
    }
    configureServices() {
        this.configureDoorbell();
        this.configureCamera();
        this.configureMotion();
        this.configureFloodLight();
    }
    configureMotion() {
        const onSchema = this.getSchema(...SCHEMA_CODE.MOTION_ON);
        if (onSchema) {
            const onService = this.accessory.getService(onSchema.code)
                || this.accessory.addService(this.Service.Switch, onSchema.code, onSchema.code);
            (0, On_1.configureOn)(this, onService, onSchema);
        }
        this.getMotionService().setCharacteristic(this.Characteristic.MotionDetected, false);
    }
    configureDoorbell() {
        // Check to see if it is indeed a doorbell.
        if (!this.getSchema(...SCHEMA_CODE.DOORBELL)) {
            return;
        }
        const schema = this.getSchema(...SCHEMA_CODE.DOORBELL_RING, ...SCHEMA_CODE.ALARM_MESSAGE);
        if (!schema) {
            return;
        }
        (0, ProgrammableSwitchEvent_1.configureProgrammableSwitchEvent)(this, this.getDoorbellService(), schema);
    }
    configureCamera() {
        if (this.stream !== undefined) {
            return;
        }
        if (this.device.isVirtualDevice()) {
            return;
        }
        this.stream = new TuyaStreamDelegate_1.TuyaStreamingDelegate(this);
        this.accessory.configureController(this.stream.controller);
    }
    configureFloodLight() {
        if (!this.getSchema(...SCHEMA_CODE.LIGHT_ON)) {
            return;
        }
        (0, Light_1.configureLight)(this, this.getLightService(), this.getSchema(...SCHEMA_CODE.LIGHT_ON), this.getSchema(...SCHEMA_CODE.LIGHT_BRIGHT), undefined, undefined, undefined);
    }
    getLightService() {
        return this.accessory.getService(this.Service.Lightbulb)
            || this.accessory.addService(this.Service.Lightbulb, this.accessory.displayName + ' Floodlight');
    }
    getDoorbellService() {
        return this.accessory.getService(this.Service.Doorbell)
            || this.accessory.addService(this.Service.Doorbell);
    }
    getMotionService() {
        return this.accessory.getService(this.Service.MotionSensor)
            || this.accessory.addService(this.Service.MotionSensor, this.accessory.displayName + ' Motion Detect');
    }
    async onDeviceStatusUpdate(status) {
        super.onDeviceStatusUpdate(status);
        const doorbellRingSchema = this.getSchema(...SCHEMA_CODE.DOORBELL_RING);
        const alarmMessageSchema = this.getSchema(...SCHEMA_CODE.ALARM_MESSAGE);
        if (this.getSchema(...SCHEMA_CODE.DOORBELL) && (doorbellRingSchema || alarmMessageSchema)) {
            const doorbellRingStatus = doorbellRingSchema && status.find(_status => _status.code === doorbellRingSchema.code);
            const alarmMessageStatus = alarmMessageSchema && status.find(_status => _status.code === alarmMessageSchema.code);
            if (doorbellRingStatus && doorbellRingStatus.value.length > 1) { // Compared with '1' in order to filter value '$'
                (0, ProgrammableSwitchEvent_1.onProgrammableSwitchEvent)(this, this.getDoorbellService(), doorbellRingStatus);
            }
            else if (alarmMessageStatus && alarmMessageStatus.value.length > 1) {
                (0, ProgrammableSwitchEvent_1.onProgrammableSwitchEvent)(this, this.getDoorbellService(), alarmMessageStatus);
            }
        }
        const motionSchema = this.getSchema(...SCHEMA_CODE.MOTION_DETECT);
        if (motionSchema) {
            const motionStatus = status.find(_status => _status.code === motionSchema.code);
            if (motionStatus) {
                this.onMotionDetected(motionStatus);
            }
        }
    }
    onMotionDetected(status) {
        if (!this.initialized) {
            return;
        }
        const data = Buffer.from(status.value, 'base64').toString('binary');
        if (data.length === 0) {
            return;
        }
        this.log.info('Motion event:', data);
        const characteristic = this.getMotionService().getCharacteristic(this.Characteristic.MotionDetected);
        characteristic.updateValue(true);
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => characteristic.updateValue(false), 30 * 1000);
    }
}
exports.default = CameraAccessory;
//# sourceMappingURL=CameraAccessory.js.map