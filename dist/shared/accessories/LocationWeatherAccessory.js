"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BaseAccessory_1 = __importDefault(require("./BaseAccessory"));
const CurrentWeather_1 = require("./characteristic/CurrentWeather");
const CurrentWeatherByOpenMeteo_1 = require("./characteristic/CurrentWeatherByOpenMeteo");
class LocationWeatherAccessory extends BaseAccessory_1.default {
    constructor() {
        super(...arguments);
        this.weatherConditionTuya = {
            coordinate: {
                lon: '0',
                lat: '0',
            },
            air_quality: {
                o3: '0',
                pm10: '0',
                co: '0',
                no2: '0',
                pm25: '0',
                so2: '0',
                aqi: '0',
            },
            current_weather: {
                temp: '0',
                real_feel: '0',
                uvi: '0',
                pressure: '0',
                condition: '0',
                condition_num: '0',
                humidity: '0',
                wind_speed: '0',
            },
        };
        this.weatherConditionOpenMeteo = {
            latitude: 0,
            longitude: 0,
            generationtime_ms: 0,
            utc_offset_seconds: 0,
            timezone: '',
            timezone_abbreviation: '',
            elevation: 0,
            current_units: {
                time: '',
                interval: '',
                temperature_2m: '',
                relative_humidity_2m: '',
            },
            current: {
                time: '',
                interval: 0,
                temperature_2m: 0,
                relative_humidity_2m: 0,
            },
        };
    }
    requiredSchema() {
        return [];
    }
    configureServices() {
        if (this.platform.options.weatherAPI === 'Tuya') {
            (0, CurrentWeather_1.configureCurrentWeather)(this, this.weatherConditionTuya);
        }
        else {
            (0, CurrentWeatherByOpenMeteo_1.configureCurrentWeatherByOpenMeteo)(this, this.weatherConditionOpenMeteo);
        }
    }
}
exports.default = LocationWeatherAccessory;
//# sourceMappingURL=LocationWeatherAccessory.js.map