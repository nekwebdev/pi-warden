export interface ExternalDependency {
  /** Default install spec passed to `pi install`. */
  readonly pkg: string;
  /** Normalized installed-source identifiers accepted as satisfying this dependency. */
  readonly acceptedSources: readonly string[];
  /** User-facing capability text shown in setup preview and readiness warnings. */
  readonly provides: string;
}

export const EXTERNAL_DEPENDENCIES: readonly ExternalDependency[] = [
  {
    pkg: "npm:pi-caveman",
    acceptedSources: [
      "git:github.com/jonjonrankin/pi-caveman",
      "local:pi-caveman",
    ],
    provides: "caveman response-style extension",
  },
  {
    pkg: "npm:context-mode",
    acceptedSources: [
      "git:github.com/mksglu/context-mode",
      "local:context-mode",
    ],
    provides: "context-mode tools, MCP bridge, skills",
  },
];
