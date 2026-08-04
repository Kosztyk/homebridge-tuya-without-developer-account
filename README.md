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

### Preserve HomeKit names and name multi-gang channels

Version 1.0.14 preserves names that users assign to individual services in Apple Home or the Homebridge Accessories page. This is especially useful for multi-gang switches and outlets that would otherwise return to generated names such as `Brilliant 1` and `Brilliant 2` after a restart.

The setting is enabled by default and is available in the custom plugin UI:

```text
HomeKit Names → Preserve names changed in HomeKit
```

Equivalent configuration:

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "preserveHomeKitNames": true
  }
}
```

You can also assign deterministic names to individual Tuya switch channels. The Homebridge UI can load detected devices and save these channel names automatically. The internal configuration looks like this:

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "deviceOverrides": [
      {
        "id": "YOUR_MULTI_SWITCH_DEVICE_ID",
        "switchNames": {
          "switch_1": "Coffee Machine",
          "switch_2": "Kitchen Lamp",
          "switch_usb1": "USB Ports"
        }
      }
    ]
  }
}
```

Name priority is:

```text
Explicit switchNames override
→ Existing HomeKit ConfiguredName
→ Generated device/channel name
```

Set `deviceOverrides[].preserveHomeKitNames` to `false` for a specific device when you want the plugin to reapply generated names at every restart.

### Pet Feeder custom type override

Version 1.0.18 adds a dedicated custom UI section named **Pet Feeder / Custom Type Overrides**. Use this when Tuya reports a pet feeder with the wrong category, or when the feeder is not auto-detected as `cwwsq`.

Preferred method:

1. Authenticate and let the plugin discover devices at least once.
2. Open **Plugins → Tuya without developer account for Homebridge → Settings**.
3. In **Pet Feeder / Custom Type Overrides**, click **Load Detected Devices**.
4. Select the Tuya device to force as a pet feeder.
5. Set the manual feed amount and whether to expose the Slow Feed switch.
6. Click **Add / Update Pet Feeder Override**.
7. Click **Save Configuration** and restart Homebridge.

Equivalent manual config:

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "deviceOverrides": [
      {
        "id": "YOUR_FEEDER_DEVICE_ID",
        "category": "cwwsq",
        "petFeeder": {
          "manualFeedAmount": 1,
          "exposeSlowFeed": true
        }
      }
    ]
  }
}
```

`category: "cwwsq"` is the Tuya custom type used by the plugin to select the Smart Pet Feeder accessory handler.

### Blind / window-covering calibration fixes

Version 1.0.15 added separate correction options for Tuya blinds, curtains, and window coverings whose calibration does not match HomeKit. Version 1.0.16 also fixes blinds getting stuck as Opening/Closing in Apple Home after commands are triggered from the Tuya app by refreshing and settling the state after external movement.

HomeKit expects:

```text
0   = fully closed
100 = fully open
```

Some Tuya motors report the opposite after calibration, for example `0 = open` and `100 = closed`. In that case, enable `invertPosition`. This changes both the reported state and the commanded target position.

If the position state is correct but dragging open/closed in the Home app moves the motor in the opposite physical direction, enable `reverseControl`. This swaps Tuya `open` and `close` control commands without changing percentage meaning.

Preferred method:

1. Authenticate and let the plugin discover devices at least once.
2. Open **Plugins → Tuya without developer account for Homebridge → Settings**.
3. In **Blind / Window Covering Overrides**, click **Load Detected Devices**.
4. Select the blind or curtain device.
5. Enable:

```text
Invert position 0/100      → fixes wrong open/closed startup state
Reverse open/close commands → fixes wrong movement direction
```

Optional advanced setting if a blind needs more or less time to finish after a Tuya-app command:

```json
{
  "id": "BLIND_DEVICE_ID",
  "windowCovering": {
    "invertPosition": true,
    "reverseControl": false,
    "settleSeconds": 35
  }
}
```

`settleSeconds` defaults to 35 seconds and can be set from 5 to 180 seconds.

6. Click **Add / Update Blind Override**.
7. Click **Save Configuration** and restart Homebridge.

Equivalent manual config:

```json
{
  "options": {
    "userCode": "YOUR_TUYA_USER_CODE",
    "deviceOverrides": [
      {
        "id": "YOUR_BLIND_DEVICE_ID",
        "windowCovering": {
          "invertPosition": true,
          "reverseControl": false
        }
      }
    ]
  }
}
```

For dual-channel curtain devices, advanced per-channel settings are also supported:

```json
{
  "id": "YOUR_CURTAIN_DEVICE_ID",
  "windowCovering": {
    "channels": {
      "control": {
        "invertPosition": true
      },
      "control_2": {
        "reverseControl": true
      }
    }
  }
}
```

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


### v1.0.11 User Code preservation fix

Version 1.0.11 fixes a custom settings UI regression where saving Adaptive Lighting or other configuration-only changes could preserve the auth file but remove `options.userCode` from `config.json`. The UI now preserves the existing User Code and can recover it automatically from saved `tuya-ha-qr-auth.<USER_CODE>.json` files.

### v1.0.9 UI save-state fix

Version 1.0.9 fixes the custom settings UI so changing the Adaptive Lighting checkbox immediately enables **Save Configuration**. If QR authentication is already saved, the UI performs a final auth check during save and no longer blocks normal configuration-only changes.

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

This release adds native support for Tuya Smart Pet Feeders and Tuya alarm panels that expose `master_mode`. Pet feeders expose a refined HomeKit Valve-style **Feed Now** control, Quick Feed switch, optional Slow Feed switch, feed-state sensor, and battery when available. Alarm panels are exposed as HomeKit Security System accessories, with optional extra switches controlled through `deviceOverrides[].alarm`.

Aroma diffuser devices whose Tuya QR cloud schema is empty remain visible as unsupported direct devices, but any diffuser scenes returned by Tuya are still exposed separately.

### HomeKit name preservation for multi-gang switches/outlets

Version 1.0.19 improves name preservation for any multi-service switch or outlet device. If Homebridge shows user-edited channel names, such as `Bathroom Ceiling`, `Bathroom Vent`, and `Bathroom Mirror`, but Apple Home still shows generated names such as `1`, `2`, and `3`, restart once after upgrading. The plugin now treats edited Homebridge cached service display names as authoritative and writes them back to HomeKit `Name` and `ConfiguredName`.

For deterministic names, you can still use `deviceOverrides[].switchNames`, for example:

```json
{
  "id": "DEVICE_ID",
  "switchNames": {
    "switch_1": "Bathroom Ceiling",
    "switch_2": "Bathroom Vent",
    "switch_3": "Bathroom Mirror"
  }
}
```

### v1.0.22 Tuya-app blind command handling and Stop button

For calibrated blind motors, external Tuya-app open/close events now follow the same reversal as HomeKit commands by default. This fixes motors where the Tuya app physically opens the blind but the raw Tuya update looks like `close`, causing Apple Home to show `Closing...` and then `Closed`.

A separate HomeKit **Stop Blind** switch is also exposed for blind/window-covering accessories that have a Tuya control DP. Tapping it sends the Tuya `stop` / `STOP` command and then resets the switch tile back to Off.

Recommended configuration for motors that require both position inversion and reversed commands:

```json
{
  "id": "BLIND_DEVICE_ID",
  "windowCovering": {
    "invertPosition": true,
    "reverseControl": true,
    "trustExternalControlState": true,
    "externalControlStateMode": "followReverseControl",
    "settleSeconds": 35
  }
}
```

Advanced `externalControlStateMode` values:

- `followReverseControl` — default and recommended. Tuya-app state is reversed when `reverseControl` is enabled.
- `normal` — Tuya `open` always means HomeKit open.
- `reversed` — Tuya `open` always means HomeKit closed.
