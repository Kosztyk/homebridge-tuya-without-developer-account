# Changelog

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
