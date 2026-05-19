# pi-warden

Fresh-install bootstrap and Warden setup extension for Pi Agent.

## Install

```bash
pi install npm:@nekwebdev/pi-warden
```

Restart Pi if this is a new package install.

## Setup

Run:

```text
/warden-setup
```

`/warden-setup` opens a Pi Warden setup control panel for external Pi packages:

- `npm:pi-caveman`
- `npm:context-mode`

Dependency rows show desired canonical configuration plus detected source state:

- checked mutable canonical rows are enabled; Update installs them when missing and leaves them installed when already present;
- unchecked mutable canonical rows are disabled; Update removes them when currently installed and leaves them missing when already absent;
- checked dim rows are user-managed accepted sources, such as GitHub or local installs, and Pi Warden will not install or remove them.

Use ↑/↓ to move, Space/Enter to toggle mutable rows or the warning preference, and Update to apply choices. Update installs checked missing canonical packages with `pi install`, removes unchecked installed canonical packages with `pi remove`, and saves the "Do not warn for missing dependencies" preference when Pi settings are valid. The warning toggle defaults off and suppresses only missing-dependency warnings, not corrupt settings errors.

After any successful install or remove, restart Pi so external package changes load.

## Package resources

Pi Warden exposes explicit committed resources through `package.json`:

- `pi.extensions`: `./extensions/pi-warden-core/index.ts`
- `pi.prompts`: `./prompts/bootstrap.md`

External packages are installed as separate Pi package entries. They are not re-exported through Pi Warden's `pi.extensions`.

## Testing from a source checkout

Run the reviewed test suite from this repository:

```bash
node scripts/run-tests.mjs
```

The test runner first checks that reviewed test files exist, then runs Node's test runner through `tsx`. This is a source-checkout workflow, not a published package contract.

## Prompt template

Use `/bootstrap` for fresh setup guidance after package resources load.

## Safety

Setup is explicit-update-first. It reads Pi settings to detect external packages and warning preference state, but it does not run `pi install`, run `pi remove`, or mutate Pi Warden settings until you choose Update. Pi owns package persistence after each successful install or remove. Pi Warden only writes its namespaced `piWarden.doNotWarnForMissingDependencies` preference when the settings file is valid.
