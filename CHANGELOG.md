
## 1.0.32

- Fixed the HomeKit Names editor so saving more than one channel/gang for the same Tuya device keeps every entered name, for example `switch_1`, `switch_2`, and `switch_3`.
- The Add / Update Channel Names button now stages channel names locally and avoids the Homebridge `configChanged` re-render that could drop later gang names before Save Configuration.
- The HomeKit Names table now refreshes from the staged config immediately, so all saved channel names remain visible before final save/restart.
- Keeps the v1.0.31 fixes that stopped automatic staged-config cleanup warnings and blind names like `control`.

## 1.0.30

- Fixes HomeKit names for blinds/window coverings so Tuya DP service names like `control` are never exposed as the Apple Home name.
- Keeps Homebridge/explicit channel names authoritative for HomeKit service `Name` and `ConfiguredName`.
- This is a focused naming fix only; no pet-feeder or blind-control behavior changes.

# Changelog

## 1.0.29

- Fixed special override separation and duplicate override merging. Pet Feeder, Blind / Window Covering, AC temperature, and switch channel-name settings are now isolated to matching devices and duplicate entries for the same device are merged instead of ignored.
- Added Pet Feeder HomeKit presentation option: Feed Now switch (default) or Valve-style Feed Now control. Apple Home does not provide a native Pet Feeder service type.
- Homebridge UI now reads cached Homebridge accessory service names and auto-fills multi-channel switch/outlet name fields, so all channels can be pushed into Apple Home after saving and using a HomeKit name re-import token.
- Tightened air-conditioner detection so generic DPs like mode/fan_speed no longer make unrelated devices appear as AC override candidates.

## 1.0.28

- Isolated special device overrides so Pet Feeder, Blind/Window Covering, Air Conditioner, and Switch Channel Name settings apply only to matching device types.
- Blocks old or accidental Pet Feeder overrides from converting blinds/switches/ACs into pet feeders.
- Blocks blind/window-covering overrides from applying to pet feeders, switches, ACs, or other unrelated devices.
- Blocks AC temperature overrides from appearing on pet feeders, blinds, and switches.
- Blocks switch channel-name overrides from applying to non-switch/non-outlet devices.
- The custom UI now lists only matching device candidates in each special settings section.
- The custom UI cleans misplaced special overrides from the staged config after loading detected devices; click Save Configuration to persist the cleanup.
- Runtime startup also ignores misplaced special overrides even if an old config still contains them.


## 1.0.27

- Added HomeKit name re-import token for cases where Apple Home keeps stale cached service names such as Bathroom 1/2/3 even though Homebridge shows Bathroom Ceiling / Bathroom Vent / Bathroom Mirror.
- When the token is set, Tuya accessories get a new HomeKit identity and the plugin migrates non-generic service names from the old Homebridge cache into the new HomeKit services.
- Added UI field under HomeKit Names for the re-import token. Leave it blank normally; change it only when forcing Apple Home to import names again.

# Changelog

## 1.0.26

- Added global Homebridge-name sync for all devices/services.
- New option `options.syncHomebridgeNamesToHomeKit` defaults to `true`.
- The names visible in Homebridge Accessories are now pushed into HomeKit `Name` and `ConfiguredName` on every startup.
- Applies generically to switches, outlets, fans, lights, blinds/window coverings, sensors, pet feeders, alarms, and other service types, not only multi-gang switch channels.
- Stores synced names in accessory context and calls `updatePlatformAccessories` so Apple Home receives the Homebridge service names after restart.

## 1.0.25

- Removed/cleans up legacy Stop Blind switch services more aggressively so the blind is no longer represented as a combined Window Covering + Switch accessory in Apple Home or Control Center.
- Keeps stop behavior on the native HomeKit blind/window-covering tile: tap while Opening/Closing sends Tuya stop / STOP.
- Fixed partial-stop state settling: after tapping stop, Homebridge now sets both CurrentPosition and TargetPosition to the stopped partial position and marks PositionState as STOPPED, preventing Apple Home from staying on Opening/Closing with a spinner.
- Added local motion tracking and optional position estimation for motors that do not report live percent_state while moving.
- Added optional windowCovering.travelSeconds and windowCovering.estimatePositionOnStop options, including per-channel equivalents.
- HomeKit-initiated percent targets now get a settle timer too, so a 30%/50% slider target can settle as Opened 30%/50% even when Tuya does not emit a final current-position update.

## 1.0.23

- Removed the separate HomeKit **Stop Blind** switch service and automatically removes the old cached stop service from blind/window-covering accessories.
- Added tap-to-stop behavior on the native HomeKit blind/window-covering tile: while the blind is Opening/Closing, tapping an endpoint command sends Tuya `stop` / `STOP` and sets HomeKit TargetPosition to the current position so Apple Home stops spinning at the partial position.
- Fixed stopped partial positions by making Tuya `stop` / `stopped` take priority over stale percent target DPs, preventing HomeKit from staying at Opening/Closing after a stop at 50%.
- Changed default Tuya-app open/close state mapping to `normal` and fixed override normalization so `externalControlStateMode`, `trustExternalControlState`, `tapToStop`, and `doubleClickToClose` are actually preserved from config/UI.
- Added best-effort partial-position double-tap helper: from a partially open blind, first tap continues opening; a very quick second tap attempts to close instead.

## 1.0.22

- Fixed Tuya-app blind/curtain state handling for calibrated motors where Tuya reports the app-side command string reversed, for example Tuya app Open arrives as a raw close command.
- External Tuya-app open/close state now follows the same `reverseControl` mapping by default (`externalControlStateMode: "followReverseControl"`), restoring the behavior needed by motors that require both `invertPosition` and `reverseControl`.
- Applied the external movement fix to both single blind and multi-channel window-covering handlers.
- Added a HomeKit Stop Blind switch service so users can stop movement at any time without choosing a slider position.
- Added `windowCovering.externalControlStateMode` with values `followReverseControl`, `normal`, and `reversed` for unusual motors.

## 1.0.21

- Fixed blinds/window coverings where commands triggered from the Tuya app still appeared reversed in Apple Home.
- Tuya-app `open` / `close` updates are now treated as semantic external movement targets, independent of the HomeKit reverse-control setting.
- At settle time, HomeKit current/target position is aligned to the semantic Tuya-app command endpoint when `trustExternalControlState` is enabled.
- Added optional `deviceOverrides[].windowCovering.trustExternalControlState` and per-channel equivalent; default is `true`.

## 1.0.20

- Fixed Tuya-app blind/curtain open/close updates being treated as authoritative command targets when percentage position DPs exist.
- PositionState now prefers converted `percent_state` / `percent_control` values over raw `open` / `close` command strings, preventing reversed Tuya calibration from showing the opposite Opening/Closing direction.
- External movement settling no longer forces a guessed final open/closed position for blinds that expose position DPs; it refreshes from Tuya and only marks movement stopped.
- Made multi-gang switch/outlet name repair more aggressive and generic by preferring Homebridge cached service display names, storing repaired names in accessory context, and syncing both HomeKit `Name` and `ConfiguredName`.

## 1.0.19

- Fixed HomeKit service names for multi-gang switches/outlets not being restored from Homebridge cached display names.
- Name preservation now works generically for any renamed multi-service accessory, not only a specific Bathroom device.
- Service naming now skips stale plugin-generated channel names like `1`, `2`, `3`, `switch_1`, or `Device 1` when a better user-edited cached display name exists.
- Switch and outlet services are now reused by HomeKit service subtype via `getServiceById(...)`, reducing accidental service recreation after channel renames.

## 1.0.18

- Added a Homebridge custom UI section for **Pet Feeder / Custom Type Overrides**.
- The UI can now force any detected Tuya device to use the Pet Feeder handler by writing `category: "cwwsq"`.
- Pet Feeder overrides also expose `manualFeedAmount` and `exposeSlowFeed` controls without manually editing `config.json`.
- Added `Pet Feeder` to the category override schema as a visible custom type.
- The device-cache helper now marks likely pet feeder candidates when it sees category `cwwsq` or DPs such as `quick_feed`, `manual_feed`, `slow_feed`, `meal_plan`, or `feed_state`.

## 1.0.17

- Fixed external Tuya-app blind/curtain open/close updates being interpreted with the wrong direction when invert/reverse calibration is enabled.
- External open/close commands now keep an authoritative HomeKit movement target until Tuya settles, so Apple Home no longer flips to the opposite Opening/Closing or final Closed/Open state.
- Added startup reconciliation for blinds/window coverings so stale Tuya moving states are settled after Homebridge restart without needing a manual tap in Apple Home.
- Hardened HomeKit name preservation by preserving either existing `ConfiguredName` or existing `Name`, and by avoiding AccessoryInformation name resets when name preservation is enabled.


## 1.0.16

- Fixed blinds/window coverings getting stuck as Opening/Closing in Apple Home after open/close commands are triggered from the Tuya app.
- `PositionState` now treats Tuya `control=stop` / `stopped` reports as HomeKit `STOPPED` even when Tuya does not update `percent_state` to match `percent_control`.
- Added a post-external-movement settle timer that refreshes the device from Tuya cloud and forces HomeKit out of moving state when Tuya does not send a final position/stop update.
- Added optional `deviceOverrides[].windowCovering.settleSeconds` and per-channel `settleSeconds` with a default of 35 seconds.

## 1.0.15

- Added blind/window-covering position correction options for Tuya calibration mismatches.
- Added `deviceOverrides[].windowCovering.invertPosition` so Tuya devices that report `100 = closed` can be mapped correctly to HomeKit's required `100 = open`.
- Added `deviceOverrides[].windowCovering.reverseControl` to swap Tuya open/close commands when motor direction is reversed.
- Applied position inversion consistently to `CurrentPosition`, `TargetPosition` reads, `TargetPosition` writes, and `PositionState` comparisons.
- Added advanced per-channel support through `deviceOverrides[].windowCovering.channels.control` and `channels.control_2`.
- Added a Homebridge custom UI section for selecting detected blind/curtain devices and staging these overrides.

## 1.0.14

- Preserves service names changed by users in Apple Home/Homebridge instead of resetting multi-gang switch and outlet names on every restart.
- Added global `options.preserveHomeKitNames` setting, enabled by default.
- Added per-device `deviceOverrides[].preserveHomeKitNames` override.
- Added explicit `deviceOverrides[].switchNames` channel-name overrides keyed by Tuya schema code, such as `switch_1`, `switch_2`, and `switch_usb1`.
- Added a Homebridge custom UI section for preserving HomeKit names and assigning explicit names to detected multi-switch/outlet channels.
- Name priority is now: explicit `switchNames` override → existing HomeKit `ConfiguredName` → plugin-generated default.
- Added `nameOverride` as a compatibility alias for `preserveHomeKitNames`.

## 1.0.13

- Changed Smart Pet Feeder presentation to use a refined HomeKit `Valve` service as the main **Feed Now** control.
- `Active` triggers the configured `manual_feed` amount when available, falling back to `quick_feed` when needed.
- `InUse` reflects `feed_state` so HomeKit can show when the feeder is currently feeding.
- Kept the dedicated Quick Feed switch, optional Slow Feed switch, Battery service, and Feeding occupancy/status sensor.
- Removes the old cached Manual Feed switch from feeder accessories when reconfigured, since the Valve now handles manual feeding.

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
