# Changelog

## 1.0.12

- Stopped exposing `switch_inching` as a HomeKit switch because it is an internal Tuya inching/timer configuration DP, not a user-facing relay.
- Automatically removes cached `switch_inching` Switch/Outlet services from multi-gang switch accessories when the accessory is reconfigured.
- Filters hidden/internal switch configuration DPs from switch auto-discovery so they cannot create invalid HomeKit names.
- Prevents future HAP-NodeJS invalid-name warnings caused by the raw `switch_inching` service after the affected accessory cache is refreshed.

## 1.0.11

- Fixed custom Homebridge UI initialization so the Adaptive Lighting checkbox stays checked after saving and reopening plugin settings.
- Fixed config reload handling so saved `options.enableAdaptiveLighting` is copied into the checkbox before the UI normalizes/stages plugin config.
- Preserved the `options.userCode` fix from v1.0.10 while preventing checkbox defaults from overwriting saved values.

## 1.0.10

- Fixed the custom Homebridge settings UI so saving Adaptive Lighting or other configuration-only changes preserves `options.userCode`.
- Added automatic discovery of existing `tuya-ha-qr-auth.<USER_CODE>.json` files from Homebridge storage. If the config is missing `userCode` but an auth file exists, the UI restores the User Code field and asks the user to save.
- Prevented empty User Code values from overwriting an existing QR-auth configuration during `updatePluginConfig()`.

## 1.0.9

- Fixed the custom Homebridge settings UI so toggling Adaptive Lighting marks the config as changed and enables **Save Configuration**.
- Save now performs a final existing-auth check before blocking, so normal configuration-only changes are not prevented when a QR auth token is already saved.
- Name and AC override UI changes also mark the custom config as dirty more reliably.

## 1.0.8

- Added optional HomeKit Adaptive Lighting support for eligible Tuya lights.
- Added global `options.enableAdaptiveLighting` setting in the Homebridge custom UI.
- Added per-device `deviceOverrides[].adaptiveLighting.enabled` override support.
- Adaptive Lighting is enabled only when a light exposes both Brightness and a real ColorTemperature DP. RGB-only lights, brightness-only dimmers, switches, and outlets are skipped automatically.
- Added safer logging when Adaptive Lighting is disabled or skipped for unsupported lights.

## 1.0.7

- Added Smart Pet Feeder support for `quick_feed`, `manual_feed`, `slow_feed`, `feed_state`, battery, and charging state.
- Added optional `deviceOverrides[].petFeeder.manualFeedAmount` and `deviceOverrides[].petFeeder.exposeSlowFeed`.
- Added Tuya alarm panel support as a HomeKit Security System using `master_mode`, `master_state`, and optional tamper/battery DPs.
- Added optional `deviceOverrides[].alarm` fields for alarm sound, muffling, and notification switches.
- Added clearer logging when Tuya returns an empty schema for aroma diffusers. Diffuser scenes remain exposed separately.

## 1.0.6

- Fixed a Homebridge UI issue where clicking **Save Configuration** could leave the custom settings page spinner running indefinitely even when QR authentication data had already been saved.
- Added timeout handling around the custom UI save flow.
- Added post-save verification of the plugin config so users receive a clear success or recovery message instead of a permanent spinner.


## 1.0.5

- Added support for DP10 / category `tgq` Tuya dimmer plugs that expose `switch_led` + `bright_value_v2`.
- Fixed dimmer validation so devices using `bright_value_v2` are exposed as HomeKit Lightbulb accessories with On and Brightness instead of being marked unsupported.
- Fixed dimmer on/off schema matching so `bright_value_v2` no longer incorrectly searches for `switch_v2` / `switch_led_v2`.

## 1.0.4

- Added a Homebridge settings UI helper for air conditioner temperature overrides.
- Users can now select a detected Tuya device by name instead of manually finding and pasting the device ID.
- Added a backend UI endpoint that reads the cached Tuya device list from Homebridge `persist/TuyaDeviceList*.json`.
- AC-looking devices are listed first when metadata suggests they are air conditioners.
- The UI writes the correct `deviceOverrides[].id` automatically and saves `airConditioner.minTemperature`, `airConditioner.maxTemperature`, and `airConditioner.temperatureStep`.

## 1.0.3

- Added user-friendly air conditioner temperature limit overrides under `deviceOverrides[].airConditioner`.
- Allows per-device HomeKit AC setpoint limits such as 16-31 °C or 17-31 °C.
- Allows `temperatureStep: 1` to suppress 0.5 °C steps in the Home app.
- Values are always configured in Celsius; Fahrenheit users see the Home app converted values automatically.

## 1.0.2

- Fixed startup abort when Homebridge UI saves an empty or incomplete `deviceOverrides` row. Invalid override rows without `id` are now skipped with a warning instead of stopping QR cloud startup.
- Duplicate device override IDs are now ignored safely, keeping the first valid entry.
- Invalid or duplicate schema override entries are now skipped with warnings instead of blocking Homebridge startup.

## 1.0.1

- Fixes repeated `code=-9999999, msg=sign invalid` errors caused by incomplete token expiry handling and non-persistent token refreshes.
- Saves refreshed Tuya QR access/refresh tokens immediately to the Homebridge storage auth file.
- Retries a signed Tuya request once after forcing a token refresh when Tuya returns `sign invalid`.
- Accepts both snake_case and camelCase token fields returned by Tuya QR login/refresh responses.
- Adds the plugin icon to the custom Homebridge settings UI and README.

## 1.0.0

- Initial QR-only release.

## 1.0.0

- Renamed plugin to **Tuya without developer account for Homebridge**.
- Added Homebridge custom UI for QR Cloud Authentication before save.
- Removed user-facing legacy Tuya IoT Developer Platform setup.
- Removed Access ID, Access Secret, username/password, country code, local-key, local LAN, and hybrid setup paths from configuration.
- Made QR Cloud Authentication the only supported connection mode.
- Added publish-ready npm package metadata.
