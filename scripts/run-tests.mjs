import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const tests = [
	"extensions/pi-warden-core/external-deps.test.ts",
	"extensions/pi-warden-core/index.test.ts",
	"extensions/pi-warden-core/package-checks.test.ts",
	"extensions/pi-warden-core/package-manifest.test.ts",
	"extensions/pi-warden-core/pi-installer.test.ts",
	"extensions/pi-warden-core/session-hooks.test.ts",
	"extensions/pi-warden-core/setup-command.test.ts",
	"extensions/pi-warden-core/setup-panel.test.ts",
	"extensions/pi-warden-core/utils.test.ts",
];

const missing = tests.filter((file) => !existsSync(file));
if (missing.length > 0) {
	console.error(`Missing reviewed test files:\n${missing.join("\n")}`);
	process.exit(1);
}

const result = spawnSync(
	process.execPath,
	["--import", "tsx", "--test", ...tests],
	{
		stdio: "inherit",
	},
);

process.exit(result.status ?? 1);
