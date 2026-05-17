"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureAirQuality = configureAirQuality;
const TuyaDevice_1 = require("../../../cloud/device/TuyaDevice");
const util_1 = require("../../util/util");
function configureAirQuality(accessory, service, airQualitySchema, pm2_5Schema, pm10Schema, vocSchema) {
    if (!airQualitySchema) {
        return;
    }
    if (!service) {
        service = accessory.accessory.getService(accessory.Service.AirQualitySensor)
            || accessory.accessory.addService(accessory.Service.AirQualitySensor);
    }
    const property = airQualitySchema.property;
    const multiple = Math.pow(10, property ? property.scale : 0);
    const { UNKNOWN, EXCELLENT, GOOD, FAIR, INFERIOR, POOR } = accessory.Characteristic.AirQuality;
    service.getCharacteristic(accessory.Characteristic.AirQuality)
        .onGet(() => {
        const status = accessory.getStatus(airQualitySchema.code);
        if (airQualitySchema.type === TuyaDevice_1.TuyaDeviceSchemaType.Integer) {
            const value = (0, util_1.limit)(status.value / multiple, 0, 1000);
            if (value <= 10) {
                return EXCELLENT;
            }
            else if (value <= 50) {
                return GOOD;
            }
            else if (value <= 100) {
                return FAIR;
            }
            else if (value <= 200) {
                return INFERIOR;
            }
            else {
                return POOR;
            }
        }
        else if (airQualitySchema.type === TuyaDevice_1.TuyaDeviceSchemaType.Enum) {
            if (status.value === 'great') {
                return EXCELLENT;
            }
            else if (status.value === 'good') {
                return GOOD;
            }
            else if (status.value === 'mild') {
                return FAIR;
            }
            else if (status.value === 'medium') {
                return INFERIOR;
            }
            else if (status.value === 'severe') {
                return POOR;
            }
        }
        return UNKNOWN;
    });
    pm2_5Schema && configureDensity(accessory, service, accessory.Characteristic.PM2_5Density, pm2_5Schema);
    pm10Schema && configureDensity(accessory, service, accessory.Characteristic.PM10Density, pm10Schema);
    vocSchema && configureDensity(accessory, service, accessory.Characteristic.VOCDensity, vocSchema);
}
function configureDensity(accessory, service, characteristic, schema) {
    if (!schema) {
        return;
    }
    const property = schema.property;
    const multiple = Math.pow(10, property ? property.scale : 0);
    service.getCharacteristic(characteristic)
        .onGet(() => {
        const status = accessory.getStatus(schema.code);
        const value = (0, util_1.limit)(status.value / multiple, 0, 1000);
        return value;
    });
}
//# sourceMappingURL=AirQuality.js.map