import {
	EXTERNAL_DEPENDENCIES,
	type ExternalDependency,
} from "./external-deps.js";
import {
	isPlainObject,
	readPiAgentSettings,
	type PiAgentSettingsError,
} from "./utils.js";

const GITHUB_HOST = "github.com";

export type MissingExternalDependenciesResult =
	| { readonly ok: true; readonly missing: ExternalDependency[] }
	| { readonly ok: false; readonly settingsError: PiAgentSettingsError };

export function findMissingExternalDependencies(): MissingExternalDependenciesResult {
	const result = readPiAgentSettings();
	if (!result.ok) {
		if (result.kind === "missing") {
			return { ok: true, missing: [...EXTERNAL_DEPENDENCIES] };
		}
		return { ok: false, settingsError: result };
	}

	const installedSources = new Set(
		result.packages
			.map(getPackageSource)
			.map((source) => source && normalizePackageSource(source))
			.filter((source): source is string => Boolean(source)),
	);

	return {
		ok: true,
		missing: EXTERNAL_DEPENDENCIES.filter(
			(dependency) =>
				!dependency.acceptedSources.some((source) =>
					installedSources.has(source),
				),
		),
	};
}

function getPackageSource(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (!isPlainObject(entry)) return undefined;
	return typeof entry.source === "string" ? entry.source : undefined;
}

function normalizePackageSource(source: string): string | undefined {
	const trimmed = source.trim();
	if (!trimmed) return undefined;

	const npmSource = normalizeNpmSource(trimmed);
	if (npmSource) return npmSource;

	const repoSource = normalizeGitHubSource(trimmed);
	if (repoSource) return repoSource;

	const localSource = normalizeLocalSource(trimmed);
	if (localSource) return localSource;

	return trimmed.toLowerCase();
}

function normalizeNpmSource(source: string): string | undefined {
	if (!source.toLowerCase().startsWith("npm:")) return undefined;

	const withoutProtocol = source.slice("npm:".length);
	const versionIndex = findNpmVersionIndex(withoutProtocol);
	const packageName =
		versionIndex === -1
			? withoutProtocol
			: withoutProtocol.slice(0, versionIndex);
	return `npm:${packageName.toLowerCase()}`;
}

function findNpmVersionIndex(packageName: string): number {
	const slashIndex = packageName.indexOf("/");
	return packageName.indexOf("@", slashIndex === -1 ? 1 : slashIndex + 1);
}

function normalizeGitHubSource(source: string): string | undefined {
	const withoutGitPrefix = source.toLowerCase().startsWith("git:")
		? source.slice("git:".length)
		: source;

	const shorthandMatch = withoutGitPrefix.match(
		/^(?:git@)?github\.com[:/]([^/@:]+)\/([^/@:]+?)(?:\.git)?(?:@.+)?$/i,
	);
	if (shorthandMatch) {
		return githubRepoId(shorthandMatch[1], shorthandMatch[2]);
	}

	try {
		const url = new URL(withoutGitPrefix);
		if (url.hostname.toLowerCase() !== GITHUB_HOST) return undefined;
		const segments = url.pathname.split("/").filter(Boolean);
		if (segments.length !== 2) return undefined;
		const [owner, repo] = segments;
		return githubRepoId(owner, stripGitSuffix(repo));
	} catch {
		return undefined;
	}
}

function normalizeLocalSource(source: string): string | undefined {
	if (!isLocalPath(source)) return undefined;

	const normalized = source.replace(/[/\\]+$/, "");
	const basename = normalized.split(/[/\\]/).filter(Boolean).at(-1);
	if (!basename) return undefined;
	return `local:${stripGitSuffix(basename).toLowerCase()}`;
}

function isLocalPath(source: string): boolean {
	return (
		source.startsWith("/") ||
		source.startsWith("./") ||
		source.startsWith("../") ||
		source.startsWith("~/") ||
		/^[A-Za-z]:[/\\]/.test(source)
	);
}

function githubRepoId(owner: string, repo: string): string {
	return `repo:${GITHUB_HOST}/${owner.toLowerCase()}/${stripGitSuffix(repo).toLowerCase()}`;
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, "");
}
