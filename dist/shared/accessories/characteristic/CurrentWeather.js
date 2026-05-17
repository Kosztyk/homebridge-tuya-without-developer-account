"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCurrentWeather = configureCurrentWeather;
function configureCurrentWeather(accessory, weatherCondition) {
    // First time
    accessory.log.info('get current weather from Tuya.');
    const res = accessory.deviceManager.getCurrentWeather(accessory.device.lat, accessory.device.lon);
    res.then(result => Object.assign(weatherCondition, result));
    // Controlling API call frequency
    setInterval(() => {
        const res = accessory.deviceManager.getCurrentWeather(accessory.device.lat, accessory.device.lon);
        res.then(result => Object.assign(weatherCondition, result));
    }, 10 * 60 * 1000); // 10 minutes
    {
        let service;
        if (!service) {
            service = accessory.accessory.getService(accessory.Service.TemperatureSensor)
                || accessory.accessory.addService(accessory.Service.TemperatureSensor);
        }
        service.getCharacteristic(accessory.Characteristic.CurrentTemperature)
            .onGet(() => {
            return weatherCondition.current_weather.temp;
        })
            .setProps({
            unit: '℃',
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
            return weatherCondition.current_weather.humidity;
        })
            .setProps({
            unit: '%',
            minValue: 0.0,
            maxValue: 100.0,
            minStep: 0.1,
        });
    }
}
//# sourceMappingURL=CurrentWeather.js.map