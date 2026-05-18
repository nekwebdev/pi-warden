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

`/warden-setup` detects missing external Pi packages, previews changes, asks for confirmation, then installs:

- `npm:pi-caveman`
- `npm:context-mode`

After any successful install, restart Pi so newly installed external packages load.

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

Setup is confirmation-first. It reads Pi settings to detect missing packages, but does not run `pi install` until you confirm. Pi owns settings persistence after each successful install.
