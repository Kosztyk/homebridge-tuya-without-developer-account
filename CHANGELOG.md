# 1.0.56

- Fixed Apple Home showing impossible fan speeds such as ~285% after the v1.0.55 six-speed percentage migration.
- The cause was stale HomeKit service metadata: older plugin versions exposed `fan_speed` with `maxValue=6`, while v1.0.55 started returning percentage values such as 17. Apple Home could retain the old maximum and display 17 relative to 6.
- Discrete integer `fan_speed` devices now use a stable refreshed fan-service subtype (`fan_speed_percent_v2`) so HomeKit receives new 0-100% RotationSpeed metadata. The accessory UUID remains unchanged.
- The RotationSpeed `minStep` now reflects the physical level count (`100 / levelCount`) instead of exposing a 100-step slider. A six-speed fan therefore has six usable non-zero positions at approximately 17%, 33%, 50%, 67%, 83%, and 100%.
- The current mapped percentage is seeded immediately after applying the new characteristic properties.
- Percentage-native schemas such as `fan_speed_percent` are unchanged.
- RGB/white-light fixes from v1.0.54 remain unchanged.

# 1.0.55

- Fixed discrete integer fan-speed mapping in Apple Home/HomeKit.
- Tuya `fan_speed` levels are now translated to HomeKit's 0-100% `RotationSpeed` range instead of exposing raw level numbers as percentages.
- A six-speed fan (`fan_speed` 1..6) now reports approximately 17%, 33%, 50%, 67%, 83%, and 100% for levels 1 through 6.
- HomeKit percentage writes are quantized back to the nearest supported Tuya fan-speed level.
- Explicit percentage schemas such as `fan_speed_percent` keep their native percentage behavior.
- The change is generic for discrete integer `fan_speed` devices and does not alter the product-specific RGB/white-light fixes from v1.0.54.

# 1.0.54

- Simplified RGB OFF for the verified dual-light ceiling fan (`product_id: atfenlerda169ygw`) based on the latest user trace.
- HomeKit RGB OFF now sends **only** `colour_switch=false`. The previous `colour_switch=true -> false` effect-toggle sequence was removed because `true` activates the rainbow/effect mode and causes a visible flash.
- A successful `colour_switch=false` cloud response is treated as authoritative for a HomeKit-originated OFF, so the plugin no longer waits for DP103 `off` before updating the HomeKit switch.
- Concurrent/repeated HomeKit OFF writes are coalesced, and OFF requests received after the synthetic RGB state is already false do not generate additional Tuya commands.
- Added a short stale-`colour_data` suppression window after OFF so delayed MQTT colour echoes cannot immediately flip the HomeKit RGB switch back to ON.
- Normal static RGB ON remains unchanged: the plugin re-sends the last HSV `colour_data` and never uses `colour_switch=true`.

# 1.0.53

- Fixed the remaining HomeKit RGB OFF state issue for the verified dual-light ceiling fan (`product_id: atfenlerda169ygw`).
- HomeKit RGB OFF now performs exactly one serialized `colour_switch=true` -> short delay -> `colour_switch=false` sequence, matching the firmware behavior observed in Smart Life.
- Removed the previous `colour_switch=false` first attempt and delayed fallback, which could create several overlapping OFF timers and repeated colour/effect flashes.
- Added an in-flight RGB OFF promise so duplicate HomeKit OFF writes are coalesced into one hardware operation.
- After the final `colour_switch=false` succeeds, the plugin explicitly sets synthetic `rgb_light_power=false` and updates HomeKit `On=false` instead of waiting indefinitely for DP103 `off`.
- DP103 remains external status feedback: `off` means RGB OFF, while `mode_*` means RGB/effect active.
- Normal static RGB ON remains unchanged: it re-sends the last `colour_data` HSV value and never uses `colour_switch=true`.

# 1.0.52

- Fixed RGB OFF for the verified dual-light ceiling fan (`product_id: atfenlerda169ygw`).
- Tuya HA QR rejects raw numeric command `103="off"` with error `2008`, so DP103 is now treated as **status/report-only**.
- HomeKit RGB **Off** now sends the writable schema command `colour_switch=false`. `colour_switch=true` is still never used for normal RGB ON because it starts the rainbow/effect mode.
- If direct `colour_switch=false` is not confirmed by an incoming DP103 `off` report, the plugin performs one guarded Smart-Life-style fallback: `colour_switch=true`, then `colour_switch=false`.
- Incoming DP103 values such as `mode_10` are now interpreted as RGB active (`rgb_light_power=true`) instead of being ignored; DP103 `off` remains authoritative for the OFF state.
- Static RGB **On** remains driven by the last `colour_data` HSV value, so turning RGB on does not start the rainbow effect.

# 1.0.51

- Corrected RGB power handling for dual-light ceiling fan PID `atfenlerda169ygw` using the user's live Homebridge MQTT behavior. `colour_switch` is no longer used as RGB power because `true` starts the fan's rainbow/effect mode.
- HomeKit RGB **On** now re-sends the last valid `colour_data` HSV payload, matching the Smart Life behavior where selecting a static color activates the RGB LEDs. The last valid HSV value is persisted in the cached HomeKit accessory context and survives Homebridge restarts.
- HomeKit RGB **Off** now sends the verified proprietary raw DP `103` value `"off"`; incoming raw DP103 reports are normalized to an internal `rgb_light_power` status instead of being incorrectly mapped to `colour_switch`.
- Any live `colour_data` update marks the RGB HomeKit service ON, so choosing a color no longer leaves the HomeKit switch visually OFF.
- Preserves the white-light suppression workaround: if changing RGB wakes `switch_led` while white was intentionally off, the plugin sends `switch_led=false` again after the RGB command.
- RGB brightness remains hidden because this firmware does not expose adjustable RGB brightness.

# 1.0.50

- Reissued the corrected ceiling-fan dual-light/RGB build from 1.0.49 as a new npm-publishable version.
- No functional changes from the corrected 1.0.49 build.

# 1.0.49

- Corrected the ceiling-fan RGB implementation using live MQTT evidence from Tuya PID `atfenlerda169ygw` instead of treating the fan as one combined RGBCW lamp.
- Exposes the existing un-subtyped fan light as the white lamp (`switch_led`, `bright_value`, `temp_value`) and adds a stable `rgb_light` HomeKit Lightbulb service for the separate decorative RGB channel (`colour_switch`, `colour_data`).
- Added a narrow raw-DP compatibility mapping for this PID: MQTT reports such as `{"103":"off"}` are translated to `colour_switch=false`, so RGB on/off state can reach HomeKit even though Tuya omits `code`/`value` from that proprietary report.
- RGB Hue/Saturation preserve the device's existing `colour_data.v`; no RGB Brightness characteristic is exposed because the owner confirmed RGB brightness is not adjustable.
- When an RGB color change wakes the white LED while the white HomeKit light was off, the plugin sends a follow-up `switch_led=false`, matching the manual workaround reported from the Smart Life app.
- Preserves the v1.0.47 alarm fixes, v1.0.46 blind state-machine fixes, Adaptive Lighting persistence, HomeKit name persistence, and independent MQTT debugging.

# 1.0.48

- Fixed RGB/HSV detection for Tuya ceiling-fan lights whose standard `colour_data` or `colour_data_v2` schema reports an empty property object (`{}`).
- Fan light services can now expose HomeKit Hue, Saturation and color-mode Brightness using Tuya `work_mode=colour` + `colour_data`, while preserving white brightness and color temperature through `work_mode=white`.
- Added `colour_data_v2` support to `FanAccessory`.
- Made Tuya HA MQTT connection lifecycle messages visible at info level for easier diagnostics.
- Deliberately does not treat proprietary `colour_switch` as a second RGB-light power DP without proof; devices where it never changes continue to use the standard `switch_led`/`work_mode`/`colour_data` path.

# 1.0.47

- Fixed Security System service naming. Empty cached names no longer fall through to the accidental `Tuya Service` placeholder, and existing `Tuya Service` / generic `Security System` names are repaired to the actual Tuya alarm device name on startup.
- Marked the HomeKit `SecuritySystem` service as the accessory primary service so alarm panels remain presented as alarms even when optional siren/mute/notification switch services are exposed.
- Added the optional HomeKit `SecuritySystemAlarmType` characteristic, reporting `NO_ALARM` normally and `UNKNOWN` while Tuya reports an alarm/SOS condition.
- Fixed the MQTT debug selector so `MQTT debug` works independently and no longer requires `API debug` to be enabled.

# 1.0.46

- Fixed repeated blind tile tap-to-stop becoming unreliable after one or two stop/resume cycles. HomeKit-initiated movement state now takes precedence over stale Tuya `control=stop` values until the movement is explicitly stopped or settled.
- Fixed bidirectional double-tap reversal. A fast second tile tap now reverses opening to closing and closing to opening both after a partial-stop resume and immediately after a tap-to-stop.
- Ignore stale/echo `stop` control-DP updates while an internally tracked HomeKit movement is still active. Explicit HomeKit stop commands still settle immediately.
- Applied the same state-machine fixes to both `BlindsAccessory` and `WindowCoveringAccessory`.

## 1.0.45

- Reworked blind/window-covering tile behavior into a direction-aware state machine. From fully closed, tap opens; tap while opening stops; the next tap resumes opening. From fully open, the same behavior is mirrored for closing.
- When stopped at a partial position, a single tap resumes the direction that was moving before the stop; a very quick second tap reverses that direction (opening → closing or closing → opening).
- Added `windowCovering.openPositionThreshold` and `windowCovering.closedPositionThreshold`, including per-channel variants. This allows a calibrated motor that is physically fully open at a reported 94%, for example, to be exposed to HomeKit as 100% open.
- Endpoint normalization is applied after optional position inversion and is used by current-position, target-position, startup reconciliation, and movement-state logic.
- Improved stop/reverse position estimation for motors without a live `percent_state` DP by using the active movement estimate during repeated tile taps.
- Updated the Blind / Window Covering custom UI with endpoint-threshold controls and clarified that the legacy `doubleClickToClose` flag now enables partial-stop double-tap direction reversal.

## 1.0.44

- Fixed Adaptive Lighting persistence when the Homebridge modal's bottom **SAVE** button is pressed immediately after toggling the option. The bottom SAVE remains locked until the direct disk write and Homebridge parent-buffer verification finish.
- Added a persistent `tuya-adaptive-lighting.json` guard in the Homebridge storage directory. The runtime reads this preference on startup, so a stale/default Homebridge UI save cannot silently disable Adaptive Lighting after restart.
- The settings backend repairs `options.enableAdaptiveLighting` in `config.json` from that persistent state if a stale UI write changes it.
- Adaptive Lighting configuration no longer depends on the checkbox DOM state during unrelated config normalisation; the committed boolean is held separately and only changed by the Adaptive Lighting control.
- Explicitly configures HAP-NodeJS `AdaptiveLightingController` in AUTOMATIC mode for eligible lights and logs successful controller setup.

# 1.0.41

- Made `config.json` the canonical persistence path for the custom UI instead of mixing direct writes with Homebridge UI staged `updatePluginConfig()` writes.
- HomeKit multi-gang channel names now use the same direct read/backup/mutate/write flow as the proven Python repair script, including `bak-homekit-names-<unix-seconds>` backups and `names-fixed-<unix-seconds>` re-import tokens.
- Added read-back verification for `switchNames`, `syncHomebridgeNamesToHomeKit`, and `homeKitNameReimportToken` before the UI reports success.
- Adaptive Lighting is now written directly to `config.json` when toggled and read back for verification, preventing it from reverting after restart because of stale staged UI data.
- General custom-UI saves now create a backup, write atomically via a temporary file + rename, and verify the Tuya platform block from disk before reporting success.

# 1.0.38

- Fixed HomeKit Names GUI persistence to match the working manual config.json repair script.
- Every Add / Update Channel Names action now writes directly to config.json and always generates a fresh HomeKit re-import token.
- Save Configuration now preserves switchNames already stored on disk instead of overwriting them with stale staged UI config.
- Empty HomeKit name fields no longer delete existing switchNames; only the explicit Remove button removes them.


## 1.0.43

- Fixed the Homebridge modal bottom **Save** button overwriting custom UI changes with schema defaults/stale values.
- The generated Homebridge schema form is now explicitly hidden; the plugin custom UI is the only editor.
- Every custom UI change stages the complete canonical platform config into Homebridge UI before the parent Save button is enabled.
- Directly persisted switch channel names, HomeKit re-import token and Adaptive Lighting are mirrored back into the parent config buffer so a later bottom Save preserves them.


## 1.0.37

- Fixed HomeKit Names GUI save path to mirror the proven direct config.json patch.
- ADD / UPDATE CHANNEL NAMES now writes switchNames directly to config.json, enables syncHomebridgeNamesToHomeKit, and updates the HomeKit re-import token in one backend transaction.
- Removed the immediate staged Homebridge UI update after saving channel names, which could drop switch_2/switch_3 before restart.

## 1.0.35

## 1.0.36

- Reworked HomeKit name saving so the custom UI writes the full Tuya platform configuration directly to `config.json` instead of relying on Homebridge UI staged saves that could drop `switch_2` / `switch_3`.
- HomeKit UUID re-import now also tracks effective naming inputs when `homeKitNameReimportToken` is set, so corrected multi-gang names can be imported by Apple Home as new HomeKit identities.
- Removed the Pet Feeder custom override UI and ignored config-level `petFeeder` options. Real Tuya pet feeders with category `cwwsq` remain supported automatically.
- Removed Pet Feeder override options from `config.schema.json`.


- Reworked HomeKit Names UI persistence so saved `switchNames` entries are always shown, even before detected devices are loaded.
- Saved multi-gang channel-name overrides are now included in the device selector after restart.
- The HomeKit Names table no longer hides valid config entries just because the Tuya persist cache is stale or not loaded.
- This release is focused only on making names stored in `config.json` visible/editable and usable again.

## 1.0.34

- Fixed HomeKit Names custom UI persistence for multi-gang devices.
- Channel name overrides are now written directly to Homebridge config.json when ADD / UPDATE CHANNEL NAMES is clicked, avoiding Homebridge UI staging races that dropped switch_2/switch_3 or made the table empty after restart.
- Added direct UI server endpoints for reading the Tuya platform config and saving/removing switch channel-name overrides.

## 1.0.33

- Fixed HomeKit Names custom UI persistence so multiple gang/channel names for the same device survive Save Configuration, restart, and Homebridge UI re-render/configChanged events.
- The save path now harvests all visible switch_1/switch_2/switch_3 fields immediately before saving and prevents stale configChanged events from overwriting staged channel names.


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
