<p align="center">
  <img src="./homebridge-ui/public/homebridge-tuya.png" width="96" alt="Tuya without developer account for Homebridge" />
</p>

# Tuya without developer account for Homebridge

Current release: **1.0.6**


A Homebridge platform plugin for Tuya and Smart Life devices that uses **Home Assistant-style Tuya QR Cloud Authentication**.

This plugin is designed for users who want to add Tuya / Smart Life devices to HomeKit through Homebridge **without creating a Tuya IoT Developer Platform account** and without entering Tuya cloud project credentials.

## What this plugin does

- Adds Tuya / Smart Life devices to Homebridge / HomeKit.
- Uses QR Cloud Authentication modeled after the official Tuya Home Assistant authorization flow.
- Shows the QR code directly inside the Homebridge plugin settings UI.
- Saves the Tuya QR token locally inside the Homebridge storage folder.
- Fetches Tuya homes, devices, scenes, device specifications, and device status through the Tuya mobile cloud API used by the QR flow.
- Starts an MQTT-style status listener for live status updates where supported.

## What this plugin does not require

This plugin does **not** ask for:

- Tuya IoT Developer Platform account
- Tuya cloud project
- Access ID
- Access Secret
- Tuya app username
- Tuya app password
- Country code / data center selection
- Local device keys

## Supported authentication method

Only one connection method is supported:

```text
Tuya QR Cloud Authentication
```

Legacy connection methods were intentionally removed from this fork:

```text
Tuya IoT OpenAPI project credentials: removed
Smart Home username/password cloud login: removed
Local LAN / local-key mode: removed
Hybrid cloud + local mode: removed
```

## Installation from Homebridge UI

After the package is published to npm, users can install it from the Homebridge UI:

1. Open Homebridge UI.
2. Go to **Plugins**.
3. Search for:

```text
homebridge-tuya-without-developer-account
```

4. Click **Install**.
5. Open the plugin **Settings**.
6. Enter your Tuya User Code.
7. Click **Generate QR Code**.
8. Scan the QR code with the Tuya Smart or Smart Life mobile app.
9. Wait for the approval message.
10. Click **Save Configuration**.
11. Restart Homebridge.

## Manual installation

```bash
npm install -g homebridge-tuya-without-developer-account
```

For the official Homebridge Linux service layout:

```bash
export PATH=/opt/homebridge/bin:$PATH
npm install --prefix /var/lib/homebridge homebridge-tuya-without-developer-account
hb-service restart
```

## Configuration

The preferred configuration path is the Homebridge plugin GUI because the QR code is generated before saving.

The saved config block looks like this:

```json
{
  "platform": "TuyaNoDeveloperAccount",
  "name": "Tuya without developer account",
  "mode": "cloud",
  "options": {
    "projectType": "3",
    "userCode": "YOUR_TUYA_USER_CODE"
  }
}
```

The plugin keeps `mode: "cloud"` and `projectType: "3"` internally only for compatibility with the original code structure. No other connection modes are supported.

## Where to find the Tuya User Code

In the Tuya Smart or Smart Life mobile app, find the **User Code** from the account/security area used by Tuya's Home Assistant QR authorization flow.

Typical path:

```text
Tuya Smart / Smart Life app
→ Me
→ Settings
→ Account and Security
→ User Code
```

Tuya app layouts can change, so the exact path may vary by app version and region.

## Token storage

After QR approval, the plugin saves the token in the Homebridge storage folder:

```text
tuya-ha-qr-auth.<USER_CODE>.json
```

For official Linux Homebridge installs this is usually:

```text
/var/lib/homebridge/tuya-ha-qr-auth.<USER_CODE>.json
```

The file contains Tuya QR authentication tokens. Keep it private.

## Re-authentication

From the plugin settings UI:

1. Enter the same User Code.
2. Click **Clear Saved Auth**.
3. Click **Generate QR Code**.
4. Scan the new QR code.
5. Save and restart Homebridge.

Manual reset:

```bash
rm -f /var/lib/homebridge/tuya-ha-qr-auth.*.json
hb-service restart
```

Then open the plugin settings and generate a new QR code.

## Advanced options

### Home whitelist

Optional. Limit device discovery to specific Tuya home IDs.

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "homeWhitelist": ["123456789"]
  }
}
```

### Device overrides

Optional. Use only when a device is discovered with the wrong category or requires schema overrides.

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "deviceOverrides": [
      {
        "id": "DEVICE_ID_OR_GLOBAL",
        "category": "kg",
        "unbridged": false
      }
    ]
  }
}
```

Use `global` as the override ID to apply an override globally.

### Air conditioner temperature limits

Optional. For Wi-Fi AC units, you can limit the Home app setpoint range and step size. Values are always configured in Celsius. If the iPhone/Home app is set to Fahrenheit, HomeKit converts the values automatically.

The preferred method is the Homebridge plugin settings UI:

1. Authenticate and let the plugin discover devices at least once.
2. Open **Plugins → Tuya without developer account for Homebridge → Settings**.
3. In **Air Conditioner Temperature Overrides**, click **Load Detected Devices**.
4. Select the AC device by name, for example **Bedroom AC**.
5. Enter:

```text
Min Temperature: 17
Max Temperature: 31
Step: 1
```

6. Click **Add / Update AC Override**.
7. Click **Save Configuration** and restart Homebridge.

The UI automatically saves the correct Tuya device ID. Users no longer need to manually find and paste the device ID for this AC override.

The saved config looks like this internally:

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "deviceOverrides": [
      {
        "id": "THE_SELECTED_AC_DEVICE_ID",
        "airConditioner": {
          "minTemperature": 17,
          "maxTemperature": 31,
          "temperatureStep": 1
        }
      }
    ]
  }
}
```

For ACs that support 16 °C minimum, set **Min Temperature** to `16`.

Fahrenheit display examples:

```text
16 °C ≈ 61 °F
17 °C ≈ 63 °F
31 °C ≈ 88 °F
```

HomeKit stores temperature characteristic metadata in Celsius. Do not enter Fahrenheit values in the plugin config.


## Adaptive Lighting

Version 1.0.8 adds optional HomeKit Adaptive Lighting support. Enable it in the Homebridge plugin settings with **Enable Adaptive Lighting for eligible CCT/RGBCW lights**.

Adaptive Lighting is applied only to Tuya light accessories that expose both:

- Brightness
- A real white color-temperature datapoint, such as `temp_value` or `temp_value_v2`

The plugin automatically skips RGB-only lights, brightness-only dimmers such as DP10 dimmer plugs, outlets, switches, and devices without a real color-temperature datapoint. HomeKit automatic mode may send periodic color-temperature updates while Adaptive Lighting is active.

Advanced per-device override example:

```json
{
  "id": "YOUR_LIGHT_DEVICE_ID",
  "adaptiveLighting": {
    "enabled": true
  }
}
```

Set `enabled` to `false` to disable Adaptive Lighting for one device even when the global option is enabled.

## Troubleshooting

### Plugin starts from cache only and logs `Each device override must include an "id"`

Version 1.0.2 and newer no longer abort startup for empty override rows created by the Homebridge UI. Invalid override entries are skipped with a warning. If you still see old warnings, remove empty rows from the Device Overrides section in the plugin settings and restart Homebridge.


### The QR code does not appear

Make sure you opened the settings for this plugin, not another Tuya plugin. The plugin name should be:

```text
Tuya without developer account for Homebridge
```

Also make sure the package version is `1.0.0` or newer.

### Homebridge starts but no devices are added

Check the Homebridge logs. If you see:

```text
No saved QR authentication found
```

then the configuration was saved before the QR scan was approved. Open the plugin settings again, generate the QR code, scan it, wait for approval, save, and restart Homebridge.

### Authentication expired or invalid

Clear the saved auth from the plugin settings, generate a new QR code, scan it, save, and restart Homebridge.

### Duplicate accessories

Do not run this plugin and another Tuya Homebridge plugin against the same devices at the same time. Disable or remove the other Tuya platform block before using this plugin.

## Package identity

```text
npm package: homebridge-tuya-without-developer-account
Homebridge platform: TuyaNoDeveloperAccount
Display name: Tuya without developer account for Homebridge
```

## Credits

This project is based on the Homebridge Tuya plugin codebase and adapts the Tuya Home Assistant QR authorization model for Homebridge.

## License

MIT


## Token refresh and sign invalid errors

Version 1.0.1 and later persist refreshed Tuya QR tokens back to the Homebridge storage auth file. This prevents repeated startup failures such as:

```text
[Tuya QR] Fetching home list failed. code=-9999999, msg=sign invalid
```

If this still happens after upgrading, open the plugin settings, clear the saved authentication, generate a new QR code, scan it with the Tuya Smart or Smart Life app, save the configuration, and restart Homebridge. Also confirm the Homebridge host clock is synchronized, because Tuya signed requests depend on the current time.

### DP10 Smart Dimmer Plug / `bright_value_v2` dimmers

Version **1.0.5** adds support for DP10-style Tuya dimmer plugs that expose `switch_led` and `bright_value_v2`. These are exposed in HomeKit as Lightbulb accessories with On and Brightness. If the accessory was previously shown as **Not Supported**, remove only that cached accessory in Homebridge UI and restart Homebridge after upgrading.



## Version 1.0.7 device support

This release adds native support for Tuya Smart Pet Feeders and Tuya alarm panels that expose `master_mode`. Pet feeders expose quick/manual feed controls, optional slow-feed control, feed-state sensor, and battery when available. Alarm panels are exposed as HomeKit Security System accessories, with optional extra switches controlled through `deviceOverrides[].alarm`.

Aroma diffuser devices whose Tuya QR cloud schema is empty remain visible as unsupported direct devices, but any diffuser scenes returned by Tuya are still exposed separately.
