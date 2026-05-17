"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCurrentWeatherByOpenMeteo = configureCurrentWeatherByOpenMeteo;
function configureCurrentWeatherByOpenMeteo(accessory, weatherCondition) {
    // First time
    accessory.log.info('get current weather from Open-Meteo.');
    const res = accessory.deviceManager.getCurrentWeatherByOpenMeteo(accessory.device.lat, accessory.device.lon);
    res.then(result => Object.assign(weatherCondition, result));
    // Controlling API call frequency
    setInterval(() => {
        const res = accessory.deviceManager.getCurrentWeatherByOpenMeteo(accessory.device.lat, accessory.device.lon);
        res.then(result => Object.assign(weatherCondition, result));
    }, 15 * 60 * 1000); // 15 minutes
    {
        let service;
        if (!service) {
            service = accessory.accessory.getService(accessory.Service.TemperatureSensor)
                || accessory.accessory.addService(accessory.Service.TemperatureSensor);
        }
        service.getCharacteristic(accessory.Characteristic.CurrentTemperature)
            .onGet(() => {
            return weatherCondition.current.temperature_2m;
        })
            .setProps({
            unit: weatherCondition.current_units.temperature_2m,
            minValue: -273.15,
            maxValue: 500.0,
            minStep: 0.1,
        });
    }
    {
        let service;
        if (!service) {
            service = accessory.accessory.getService(accessory.Service.HumiditySensor)
                || accessory.accessory.addService(accessory.Service.HumiditySensor);
        }
        service.getCharacteristic(accessory.Characteristic.CurrentRelativeHumidity)
            .onGet(() => {
            return weatherCondition.current.relative_humidity_2m;
        })
            .setProps({
            unit: weatherCondition.current_units.relative_humidity_2m,
            minValue: 0.0,
            maxValue: 100.0,
            minStep: 0.1,
        });
    }
}
//# sourceMappingURL=CurrentWeatherByOpenMeteo.js.map