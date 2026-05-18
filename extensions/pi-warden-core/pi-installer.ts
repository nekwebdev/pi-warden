import { spawn } from "node:child_process";
import { EXIT_TIMEOUT, SIGKILL_GRACE_MS } from "./constants.js";

export interface PiInstallResult {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export function spawnPiInstall(
	pkg: string,
	timeoutMs: number,
): Promise<PiInstallResult> {
	return new Promise((resolve) => {
		const isWindows = process.platform === "win32";
		const [cmd, args, spawnOpts] = isWindows
			? ([
					"cmd.exe",
					["/c", "pi", "install", pkg],
					{ windowsHide: true },
				] as const)
			: (["pi", ["install", pkg], {}] as const);

		let settled = false;
		let closed = false;
		let stdout = "";
		let stderr = "";
		let timeoutResult: PiInstallResult | undefined;
		let killTimer: NodeJS.Timeout | undefined;

		const proc = spawn(cmd, args, {
			...spawnOpts,
			stdio: ["ignore", "pipe", "pipe"],
		});

		proc.stdout?.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		const settle = (result: PiInstallResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (killTimer) clearTimeout(killTimer);
			resolve(result);
		};

		const timer = setTimeout(() => {
			timeoutResult = {
				code: EXIT_TIMEOUT,
				stdout,
				stderr: `${stderr}${stderr ? "\n" : ""}[timed out after ${timeoutMs}ms]`,
			};
			proc.kill("SIGTERM");
			killTimer = setTimeout(() => {
				if (!closed && timeoutResult) {
					proc.kill("SIGKILL");
					settle(timeoutResult);
				}
			}, SIGKILL_GRACE_MS);
		}, timeoutMs);

		proc.on("error", (error) => {
			settle({
				code: 1,
				stdout,
				stderr: stderr + (stderr ? "\n" : "") + error.message,
			});
		});
		proc.on("close", (code) => {
			closed = true;
			settle(timeoutResult ?? { code: code ?? 1, stdout, stderr });
		});
	});
}
