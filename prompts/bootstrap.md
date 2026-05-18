---
description: Bootstrap a fresh Pi Warden install
argument-hint: "[goal]"
---

Help me bootstrap this Pi Warden setup for a fresh Pi Agent install.

Context:

- Package: `@nekwebdev/pi-warden`
- Setup command: `/warden-setup`
- External Pi packages installed by setup: `npm:pi-caveman`, `npm:context-mode`
- After successful setup installs, restart Pi so newly installed packages load.

Task:

1. Check whether Pi Warden package resources are loaded.
2. If `/warden-setup` has not run, tell me to run it.
3. If external packages were just installed, remind me to restart Pi.
4. If I provided a goal, help configure Pi Warden for it: $ARGUMENTS

Do not copy secrets or mutate config without explicit confirmation.
