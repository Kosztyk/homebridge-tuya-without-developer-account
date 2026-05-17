# Publishing guide

This package is intended to be published to npm so it can be installed from the Homebridge UI.

## Package identity

```text
npm package: homebridge-tuya-without-developer-account
Homebridge platform alias: TuyaNoDeveloperAccount
Display name: Tuya without developer account for Homebridge
```

## Before publishing

1. Create a GitHub repository:

```text
https://github.com/kosztyk/homebridge-tuya-without-developer-account
```

2. Push this source tree to GitHub.
3. Confirm the package name is available on npm:

```bash
npm view homebridge-tuya-without-developer-account name
```

If npm returns `404 Not Found`, the package name is available.

4. Run a package dry run:

```bash
npm pack --dry-run
```

5. Create the package locally:

```bash
npm pack
```

6. Test install the generated `.tgz` in a clean Homebridge instance:

```bash
npm install --prefix /var/lib/homebridge ./homebridge-tuya-without-developer-account-1.0.0.tgz
hb-service restart
```

## Publish manually

```bash
npm login
npm publish --access public
```

For an unscoped public package, `--access public` is harmless. For scoped packages it is required.

## Publish through GitHub Actions

This repository includes `.github/workflows/npm-publish.yml`.

Add this GitHub repository secret:

```text
NPM_TOKEN
```

Then create a release or run the workflow manually.

## Homebridge UI installation

After npm publication and indexing, users can install from the Homebridge UI:

```text
Plugins → Search → homebridge-tuya-without-developer-account → Install
```

## Verification note

Publishing to npm makes the plugin installable from the Homebridge UI. Homebridge verification is a separate review process and is not automatic.
