---
description: Bootstrap a fresh Pi Warden install
argument-hint: "[goal]"
---

Help me bootstrap this Pi Warden setup for a fresh Pi Agent install.

Context:

- Package: `@nekwebdev/pi-warden`
- Setup command: `/warden-setup` opens the Pi Warden setup control panel
- External Pi packages managed by setup: `npm:pi-caveman`, `npm:context-mode`
- Use the setup panel Update action to install checked missing canonical packages, remove unchecked canonical packages, and save the missing-dependency warning preference.
- User-managed accepted sources, such as GitHub or local installs, appear installed but disabled in setup.
- After successful setup installs or removes packages, restart Pi so external package changes load.

Task:

1. Check whether Pi Warden package resources are loaded.
2. If `/warden-setup` has not run, tell me to run it and use the control panel Update action.
3. If external packages were just installed or removed, remind me to restart Pi.
4. If I provided a goal, help configure Pi Warden for it: $ARGUMENTS

Do not copy secrets or mutate config without explicit confirmation.
