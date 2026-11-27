# Homebridge Verification — v1.1.6

This source retains the v1.1.3 IR AC code and v1.1.1 verification metadata and branding, with the v1.1.4 security fix for issue #20 and the v1.1.5 opt-in fix for issue #21, and the v1.1.6 settings-backup fix for issue #22.

## Preserved functionality

- Tuya QR authentication, MQTT, lights, fan presets, curtains, switches, alarm, camera, and existing accessory identities.
- v1.1.3 IR AC support and both fixes: `dp-refresh` without DP1 and LAN hub power precedence.
- The optional `tuyapi` dependency for local IR hub state, not required for ordinary QR devices.

## Verification improvements

- Dynamic ESM import for `@homebridge/camera-utils` to prevent `ERR_REQUIRE_ESM` on plugin startup.
- Camera stream callback error handling and the v1.1.1 `tsx` runner tests.
- `supports-hap` keyword and Homebridge declared in `devDependencies`, not `peerDependencies`.
- Included `assets/homebridge-icon.png` (100x100); artwork attribution in `BRANDING.md`.
- GitHub CI and npm release workflows restored.

## Before verification request

1. Publish **this exact v1.1.6 code** to GitHub.
2. Publish the matching package version to npm. npm rejects republishing a version that already exists; confirm v1.1.6 is available before publishing.
3. Create a GitHub release matching the npm version, and check Node 22/24 CI logs.
4. Use the Homebridge plugin verification issue template at https://github.com/homebridge/plugins/issues/new/choose .
5. Request the catalog icon through Homebridge's own icon request procedure; including `assets/homebridge-icon.png` in the repo/npm package does **not** automatically make it appear in the Homebridge catalog.

## Test caveat

CI uses `npm install`, not `npm ci`, because the upstream v1.1.1 lockfile lacked the v1.1.3 optional LAN dependency and cannot be updated offline in the assembly environment. A fresh lockfile can be generated in CI or in a networked Node environment with `npm install --package-lock-only`, then switch back to `npm ci` for reproducible installs.

Verification is a Homebridge team review, not something a package can guarantee.
