import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export type CliChatRole = "system" | "user" | "assistant";

export type CliChatMessage = Readonly<{
  role: CliChatRole;
  content: string;
}>;

export type CliChatExecutionRequest = Readonly<{
  correlationId: string;
  providerId: string;
  modelId: string;
  sessionId?: string;
  resumeSessionId?: string;
  cliType?: string;
  thinkingLevel?: string;
  messages: readonly CliChatMessage[];
  timeoutMs?: number;
}>;

export type CliChatExecutionResult = Readonly<{
  correlationId: string;
  providerId: string;
  modelId: string;
  content: string;
  cliSessionId?: string;
}>;

export type CliModelDescriptor = Readonly<{
  id: string;
  name: string;
}>;

export type CliModelListRequest = Readonly<{
  cliType?: string;
}>;

export type CliModelListResult = Readonly<{
  cliType: string;
  source: "discovered" | "fallback";
  models: readonly CliModelDescriptor[];
}>;

export type CliThinkingLevelsListRequest = Readonly<{
  cliType?: string;
  modelId: string;
}>;

export type CliThinkingLevelsListResult = Readonly<{
  cliType: string;
  modelId: string;
  source: "discovered" | "inferred" | "none";
  thinkingLevels: readonly string[];
}>;

export type CliChatExecutor = Readonly<{
  execute(request: CliChatExecutionRequest): Promise<CliChatExecutionResult>;
  listModels(request?: CliModelListRequest): Promise<CliModelListResult>;
  listThinkingLevels(
    request: CliThinkingLevelsListRequest,
  ): Promise<CliThinkingLevelsListResult>;
}>;

type CliErrorReasonCode =
  | "request.invalid"
  | "provider.unavailable"
  | "transport.timeout"
  | "transport.transient_failure";

type CliErrorDetails = Readonly<Record<string, string | number | boolean | null>>;

type RunCommandResult = Readonly<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>;

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 480_000;
const MAX_PROMPT_CHARS = 32_000;
const MAX_MESSAGES = 128;
const MAX_STDOUT_BYTES = 512 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_MAX_CONCURRENT = 3;
const MAX_CONCURRENT_CAP = 16;
const TERMINATION_GRACE_MS = 1_500;
const DIAGNOSTIC_EXCERPT_CHARS = 400;
const MAX_SESSION_CONTINUATION_KEYS = 512;
const WINDOWS_CMD_META_CHARS_REGEXP = /([()\][%!^"`<>&|;, *?])/g;
const DEFAULT_COPILOT_DISABLE_BUILTIN_MCPS = true;

const CLI_TYPE_COPILOT = "copilot-cli";
const CLI_TYPE_CLAUDE = "claude-code";

const THINKING_LEVEL_LOW = "low";
const THINKING_LEVEL_MED = "med";
const THINKING_LEVEL_HIGH = "high";
const THINKING_LEVEL_XHIGH = "xhigh";
const THINKING_LEVEL_ORDER = [
  THINKING_LEVEL_LOW,
  THINKING_LEVEL_MED,
  THINKING_LEVEL_HIGH,
  THINKING_LEVEL_XHIGH,
] as const;

type SupportedCliType = typeof CLI_TYPE_COPILOT | typeof CLI_TYPE_CLAUDE;

type CliProfile = Readonly<{
  id: SupportedCliType;
  commandEnvVar: string;
  defaultCommand: string;
  knownModels: readonly CliModelDescriptor[];
  buildCommandArgs(options: {
    modelId: string;
    prompt: string;
    continueSession?: boolean;
    resumeSessionId?: string;
    disableBuiltinMcps?: boolean;
  }): readonly string[];
}>;

// Curated fallback catalog aligned with GitHub Copilot "supported models" docs.
const COPILOT_FALLBACK_MODELS: readonly CliModelDescriptor[] = [
  { id: "gpt-4.1", name: "GPT-4.1" },
  { id: "gpt-5-mini", name: "GPT-5 mini" },
  { id: "gpt-5.1", name: "GPT-5.1" },
  { id: "gpt-5.1-codex", name: "GPT-5.1-Codex" },
  { id: "gpt-5.1-codex-mini", name: "GPT-5.1-Codex-Mini" },
  { id: "gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max" },
  { id: "gpt-5.2", name: "GPT-5.2" },
  { id: "gpt-5.2-codex", name: "GPT-5.2-Codex" },
  { id: "gpt-5.3-codex", name: "GPT-5.3-Codex" },
  { id: "gpt-5.4", name: "GPT-5.4" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini" },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
  { id: "claude-opus-4.6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro" },
];

// Curated fallback catalog aligned with Claude Code / Anthropic model docs.
const CLAUDE_CODE_FALLBACK_MODELS: readonly CliModelDescriptor[] = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-6-1m", name: "Claude Opus 4.6 (1M context)" },
  { id: "claude-sonnet-4-6-1m", name: "Claude Sonnet 4.6 (1M context)" },
  { id: "opus", name: "Opus (alias)" },
  { id: "sonnet", name: "Sonnet (alias)" },
  { id: "haiku", name: "Haiku (alias)" },
];

const CLI_PROFILES: Readonly<Record<SupportedCliType, CliProfile>> = {
  [CLI_TYPE_COPILOT]: {
    id: CLI_TYPE_COPILOT,
    commandEnvVar: "ARLOPASS_COPILOT_CLI_PATH",
    defaultCommand: "copilot",
    knownModels: COPILOT_FALLBACK_MODELS,
    buildCommandArgs(options): readonly string[] {
      const args = [
        ...(options.resumeSessionId !== undefined
          ? [`--resume=${options.resumeSessionId}`]
          : options.continueSession === true
            ? ["--continue"]
            : []),
        "-p",
        options.prompt,
        "--silent",
        "--stream",
        "off",
        "--output-format",
        "json",
        "--available-tools",
        ...(options.disableBuiltinMcps === true ? ["--disable-builtin-mcps"] : []),
      ];

      if (options.modelId.toLowerCase() !== CLI_TYPE_COPILOT) {
        args.push("--model", options.modelId);
      }
      return args;
    },
  },
  [CLI_TYPE_CLAUDE]: {
    id: CLI_TYPE_CLAUDE,
    commandEnvVar: "ARLOPASS_CLAUDE_CODE_CLI_PATH",
    defaultCommand: "claude",
    knownModels: CLAUDE_CODE_FALLBACK_MODELS,
    buildCommandArgs(options): readonly string[] {
      const args = [
        "-p",
        options.prompt,
        "--output-format",
        "json",
      ];

      if (options.modelId.toLowerCase() !== CLI_TYPE_CLAUDE) {
        args.push("--model", options.modelId);
      }
      return args;
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmpty(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function clampInteger(
  value: number,
  minValue: number,
  maxValue: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const floored = Math.floor(value);
  if (floored < minValue) return minValue;
  if (floored > maxValue) return maxValue;
  return floored;
}

function parseConcurrentLimit(rawValue: string | undefined): number {
  if (rawValue === undefined) {
    return DEFAULT_MAX_CONCURRENT;
  }

  const parsed = Number(rawValue);
  return clampInteger(parsed, 1, MAX_CONCURRENT_CAP, DEFAULT_MAX_CONCURRENT);
}

function safeTextExcerpt(value: string, maxChars = DIAGNOSTIC_EXCERPT_CHARS): string {
  if (value.length === 0) {
    return "";
  }

  const sanitized = value
    .replace(/[^\t\n\r -~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.slice(0, maxChars);
}

function parseModelContentFromJson(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const directStringKeys = ["content", "completion", "response", "result", "text", "message"];
  for (const key of directStringKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (Array.isArray(value["content"])) {
    const segments = (value["content"] as unknown[])
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (isRecord(entry) && typeof entry["text"] === "string") return entry["text"].trim();
        return "";
      })
      .filter((entry) => entry.length > 0);
    if (segments.length > 0) {
      return segments.join("\n");
    }
  }

  return undefined;
}

function parseModelErrorFromJson(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nestedError = value["error"];
  if (typeof nestedError === "string" && nestedError.trim().length > 0) {
    return nestedError.trim();
  }

  if (isRecord(nestedError)) {
    const nestedMessage = parseModelContentFromJson(nestedError);
    if (nestedMessage !== undefined) {
      return nestedMessage;
    }
  }

  const isExplicitError =
    value["is_error"] === true ||
    value["ok"] === false ||
    value["status"] === "error" ||
    value["type"] === "error";
  if (!isExplicitError) {
    return undefined;
  }

  const extracted = parseModelContentFromJson(value);
  if (extracted !== undefined) {
    return extracted;
  }

  return undefined;
}

function extractStructuredCliErrorMessage(stdout: string, stderr: string): string | undefined {
  for (const source of [stdout, stderr]) {
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const parsedError = parseModelErrorFromJson(payload);
      if (parsedError !== undefined) {
        const normalized = safeTextExcerpt(parsedError);
        if (normalized.length > 0) {
          return normalized;
        }
      }
    }
  }

  const stderrExcerpt = safeTextExcerpt(stderr);
  if (stderrExcerpt.length > 0) {
    return stderrExcerpt;
  }

  return undefined;
}

function formatModelDisplayName(modelId: string): string {
  return modelId
    .split(/[._-]/g)
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.length <= 3
        ? segment.toUpperCase()
        : `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`,
    )
    .join(" ");
}

function normalizeThinkingLevel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case THINKING_LEVEL_LOW:
    case THINKING_LEVEL_MED:
    case THINKING_LEVEL_HIGH:
    case THINKING_LEVEL_XHIGH:
      return normalized;
    case "medium":
      return THINKING_LEVEL_MED;
    default:
      return undefined;
  }
}

function normalizeThinkingLevelToken(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === THINKING_LEVEL_LOW ||
    normalized === THINKING_LEVEL_MED ||
    normalized === THINKING_LEVEL_HIGH ||
    normalized === THINKING_LEVEL_XHIGH
  ) {
    return normalized;
  }
  if (normalized === "medium") {
    return THINKING_LEVEL_MED;
  }
  if (normalized === "very-high" || normalized === "veryhigh") {
    return THINKING_LEVEL_XHIGH;
  }
  return undefined;
}

function toOrderedThinkingLevels(levels: ReadonlySet<string>): readonly string[] {
  return [...levels].sort((left, right) => {
    const leftIndex = THINKING_LEVEL_ORDER.indexOf(left as (typeof THINKING_LEVEL_ORDER)[number]);
    const rightIndex = THINKING_LEVEL_ORDER.indexOf(
      right as (typeof THINKING_LEVEL_ORDER)[number],
    );
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function parseThinkingLevelsFromOutput(stdout: string, stderr: string): readonly string[] {
  const combined = `${stdout}\n${stderr}`.trim().toLowerCase();
  if (combined.length === 0) {
    return [];
  }

  const levels = new Set<string>();
  const addLevel = (token: string): void => {
    const normalized = normalizeThinkingLevelToken(token);
    if (normalized !== undefined) {
      levels.add(normalized);
    }
  };

  for (const line of combined.split(/\r?\n/)) {
    if (
      !line.includes("thinking") &&
      !line.includes("reasoning") &&
      !line.includes("effort")
    ) {
      continue;
    }

    const matches =
      line.match(/\b(low|med|medium|high|xhigh|very-high|veryhigh)\b/g) ?? [];
    for (const token of matches) {
      addLevel(token);
    }
  }

  if (levels.size === 0) {
    const broadMatches =
      combined.match(/\b(low|med|medium|high|xhigh|very-high|veryhigh)\b/g) ?? [];
    for (const token of broadMatches) {
      addLevel(token);
    }
  }

  return toOrderedThinkingLevels(levels);
}

function isLikelyModelId(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 80) {
    return false;
  }
  if (normalized.startsWith("--")) {
    return false;
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    return false;
  }
  if (normalized.includes("http") || normalized.includes(" ")) {
    return false;
  }
  if (/[0-9]/.test(normalized)) {
    return true;
  }
  return /(gpt|claude|gemini|codex|opus|sonnet|haiku|mini|turbo|o1|o3)/.test(
    normalized,
  );
}

function hasWindowsExecutableExtension(commandPath: string): boolean {
  return /\.(cmd|exe|bat)$/i.test(commandPath);
}

function shouldTryWindowsExecutableSuffixes(commandPath: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const trimmed = commandPath.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (hasWindowsExecutableExtension(trimmed)) {
    return false;
  }

  if (/\.ps1$/i.test(trimmed)) {
    return false;
  }

  return true;
}

function isWindowsCmdWrapper(commandPath: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(commandPath);
}

function escapeWindowsCommand(value: string): string {
  return value.replace(WINDOWS_CMD_META_CHARS_REGEXP, "^$1");
}

function escapeWindowsCommandArgument(
  value: string,
  doubleEscapeMetaChars: boolean,
): string {
  let escaped = value;
  escaped = escaped.replace(/(\\*)"/g, "$1$1\\\"");
  escaped = escaped.replace(/(\\*)$/g, "$1$1");
  escaped = `"${escaped}"`;
  escaped = escaped.replace(WINDOWS_CMD_META_CHARS_REGEXP, "^$1");
  if (doubleEscapeMetaChars) {
    escaped = escaped.replace(WINDOWS_CMD_META_CHARS_REGEXP, "^$1");
  }
  return escaped;
}

function collectModelIdsFromJson(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectModelIdsFromJson(entry, output);
    }
    return;
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && isLikelyModelId(value)) {
      output.add(value.trim());
    }
    return;
  }

  const directKeys = ["id", "model", "name", "slug"];
  for (const key of directKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && isLikelyModelId(candidate)) {
      output.add(candidate.trim());
    }
  }

  for (const nestedKey of ["models", "data", "items", "choices"]) {
    const nested = value[nestedKey];
    if (nested !== undefined) {
      collectModelIdsFromJson(nested, output);
    }
  }
}

function parseModelCatalogFromOutput(stdout: string, stderr: string): CliModelDescriptor[] {
  const outputIds = new Set<string>();
  const combined = `${stdout}\n${stderr}`.trim();
  if (combined.length === 0) {
    return [];
  }

  // Try full JSON parse first.
  try {
    const parsed = JSON.parse(combined) as unknown;
    collectModelIdsFromJson(parsed, outputIds);
  } catch {
    // fall through
  }

  // Try line-delimited JSON payloads.
  for (const line of combined.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      collectModelIdsFromJson(parsed, outputIds);
      continue;
    } catch {
      // not JSON line, continue below
    }

    const candidates = trimmed.match(/[a-z0-9][a-z0-9._-]{2,}/gi) ?? [];
    for (const candidate of candidates) {
      if (isLikelyModelId(candidate)) {
        outputIds.add(candidate.trim());
      }
    }
  }

  return [...outputIds]
    .slice(0, 64)
    .map((id) => ({
      id,
      name: formatModelDisplayName(id),
    }));
}

function resolveWindowsPathEnv(env: NodeJS.ProcessEnv): string {
  const pathCandidates = [env["PATH"], env["Path"], env["path"]];
  for (const value of pathCandidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return "";
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function collectWindowsKnownCommandDirectories(env: NodeJS.ProcessEnv): readonly string[] {
  const userProfile =
    typeof env["USERPROFILE"] === "string" ? env["USERPROFILE"].trim() : "";
  const localAppData =
    typeof env["LOCALAPPDATA"] === "string" ? env["LOCALAPPDATA"].trim() : "";

  return dedupeStrings(
    [
      userProfile.length > 0 ? join(userProfile, ".local", "bin") : "",
      localAppData.length > 0 ? join(localAppData, "Microsoft", "WinGet", "Links") : "",
      localAppData.length > 0 ? join(localAppData, "Programs") : "",
    ].filter((entry) => entry.length > 0),
  );
}

function resolveWindowsCommandInPath(
  command: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (command.includes("\\") || command.includes("/") || command.includes(":")) {
    return existsSync(command) ? command : undefined;
  }

  const pathValue = resolveWindowsPathEnv(env);
  if (pathValue.length === 0) {
    return undefined;
  }

  const pathDirs = pathValue
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (pathDirs.length === 0) {
    return undefined;
  }

  const commandLower = command.toLowerCase();
  const hasExtension =
    commandLower.endsWith(".exe") ||
    commandLower.endsWith(".cmd") ||
    commandLower.endsWith(".bat") ||
    commandLower.endsWith(".ps1");
  const pathextRaw = env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD;.PS1";
  const pathExtensions = pathextRaw
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  const commandVariants = hasExtension
    ? [command]
    : dedupeStrings([
      command,
      ...pathExtensions.map((extension) => `${command}${extension}`),
    ]);

  for (const dir of pathDirs) {
    for (const variant of commandVariants) {
      const absoluteCandidate = join(dir, variant);
      if (existsSync(absoluteCandidate)) {
        return absoluteCandidate;
      }
    }
  }

  for (const dir of collectWindowsKnownCommandDirectories(env)) {
    for (const variant of commandVariants) {
      const absoluteCandidate = join(dir, variant);
      if (existsSync(absoluteCandidate)) {
        return absoluteCandidate;
      }
    }
  }

  return undefined;
}

function parseCopilotSessionIdFromOutput(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (
      isRecord(payload) &&
      payload["type"] === "result" &&
      typeof payload["sessionId"] === "string" &&
      payload["sessionId"].trim().length > 0
    ) {
      return payload["sessionId"].trim();
    }
  }

  return undefined;
}

export class CliChatExecutionError extends Error {
  readonly reasonCode: CliErrorReasonCode;
  readonly details: CliErrorDetails | undefined;

  constructor(
    message: string,
    options: Readonly<{
      reasonCode: CliErrorReasonCode;
      details?: CliErrorDetails;
      cause?: Error;
    }>,
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "CliChatExecutionError";
    this.reasonCode = options.reasonCode;
    this.details = options.details;
  }
}

type CopilotCliChatExecutorOptions = Readonly<{
  command?: string;
  copilotCommand?: string;
  claudeCommand?: string;
  maxConcurrent?: number;
  spawnFn?: typeof spawn;
  env?: NodeJS.ProcessEnv;
  disableCopilotBuiltinMcps?: boolean;
  resolveCommandFromPath?: (
    command: string,
    env: NodeJS.ProcessEnv,
  ) => string | undefined;
}>;

export class CopilotCliChatExecutor implements CliChatExecutor {
  readonly #commands: Readonly<Record<SupportedCliType, string>>;
  readonly #spawnEnv: NodeJS.ProcessEnv;
  readonly #disableCopilotBuiltinMcps: boolean;
  readonly #resolveCommandFromPath: (
    command: string,
    env: NodeJS.ProcessEnv,
  ) => string | undefined;
  readonly #maxConcurrent: number;
  readonly #spawnFn: typeof spawn;
  readonly #copilotContinuationKeys = new Set<string>();
  readonly #copilotSessionIdsByContinuationKey = new Map<string, string>();
  #activeExecutions = 0;

  constructor(options: CopilotCliChatExecutorOptions = {}) {
    const env = options.env ?? process.env;
    this.#spawnEnv = { ...env };
    this.#disableCopilotBuiltinMcps =
      options.disableCopilotBuiltinMcps ?? DEFAULT_COPILOT_DISABLE_BUILTIN_MCPS;
    this.#resolveCommandFromPath =
      options.resolveCommandFromPath ?? resolveWindowsCommandInPath;
    this.#commands = {
      [CLI_TYPE_COPILOT]: normalizeNonEmpty(
        options.copilotCommand ??
        options.command ??
        env[CLI_PROFILES[CLI_TYPE_COPILOT].commandEnvVar] ??
        CLI_PROFILES[CLI_TYPE_COPILOT].defaultCommand,
        CLI_PROFILES[CLI_TYPE_COPILOT].defaultCommand,
      ),
      [CLI_TYPE_CLAUDE]: normalizeNonEmpty(
        options.claudeCommand ??
        env[CLI_PROFILES[CLI_TYPE_CLAUDE].commandEnvVar] ??
        CLI_PROFILES[CLI_TYPE_CLAUDE].defaultCommand,
        CLI_PROFILES[CLI_TYPE_CLAUDE].defaultCommand,
      ),
    };
    this.#maxConcurrent = clampInteger(
      options.maxConcurrent ?? parseConcurrentLimit(env["ARLOPASS_CLI_MAX_CONCURRENT"]),
      1,
      MAX_CONCURRENT_CAP,
      DEFAULT_MAX_CONCURRENT,
    );
    this.#spawnFn = options.spawnFn ?? spawn;
  }

  async probe(timeoutMs = 5_000, cliType: string = CLI_TYPE_COPILOT): Promise<void> {
    const boundedTimeout = clampInteger(timeoutMs, 1_000, 30_000, 5_000);
    const profile = this.#resolveCliProfile(cliType);
    await this.#runCommand(
      this.#commands[profile.id],
      ["--version"],
      boundedTimeout,
      profile.id,
    );
  }

  async listModels(request: CliModelListRequest = {}): Promise<CliModelListResult> {
    const profile = this.#resolveCliProfile(request.cliType ?? CLI_TYPE_COPILOT);

    // Neither CLI provides a reliable programmatic model list.
    // Return the curated fallback catalog immediately to avoid slow
    // discovery spawns that can time out during onboarding.
    return {
      cliType: profile.id,
      source: "fallback",
      models: [...profile.knownModels],
    };
  }

  async listThinkingLevels(
    request: CliThinkingLevelsListRequest,
  ): Promise<CliThinkingLevelsListResult> {
    const modelId = normalizeNonEmpty(request.modelId, "");
    if (modelId.length === 0) {
      throw new CliChatExecutionError("Model id is required to list thinking levels.", {
        reasonCode: "request.invalid",
      });
    }

    const profile = this.#resolveCliProfile(request.cliType, modelId);
    if (profile.id !== CLI_TYPE_COPILOT) {
      return {
        cliType: profile.id,
        modelId,
        source: "none",
        thinkingLevels: [],
      };
    }

    const commandPath = this.#commands[profile.id];
    const discoveryCommands: readonly string[][] = [
      ["model", "show", modelId, "--output-format", "json"],
      ["model", "info", modelId, "--output-format", "json"],
      ["models", "--output-format", "json"],
      ["models", "list", "--output-format", "json"],
      ["--help"],
    ];

    for (const args of discoveryCommands) {
      try {
        const result = await this.#runCommand(
          commandPath,
          args,
          6_000,
          profile.id,
        );
        const parsed = parseThinkingLevelsFromOutput(result.stdout, result.stderr);
        if (parsed.length > 0) {
          const source = args.includes("--help") ? "inferred" : "discovered";
          return {
            cliType: profile.id,
            modelId,
            source,
            thinkingLevels: parsed,
          };
        }
      } catch {
        // Best-effort discovery. Continue probing.
      }
    }

    return {
      cliType: profile.id,
      modelId,
      source: "none",
      thinkingLevels: [],
    };
  }

  async execute(request: CliChatExecutionRequest): Promise<CliChatExecutionResult> {
    const correlationId = normalizeNonEmpty(request.correlationId, "");
    const providerId = normalizeNonEmpty(request.providerId, "");
    const modelId = normalizeNonEmpty(request.modelId, "");
    if (
      correlationId.length === 0 ||
      providerId.length === 0 ||
      modelId.length === 0
    ) {
      throw new CliChatExecutionError(
        "CLI chat request requires non-empty correlationId, providerId, and modelId.",
        {
          reasonCode: "request.invalid",
        },
      );
    }

    if (this.#activeExecutions >= this.#maxConcurrent) {
      throw new CliChatExecutionError(
        "CLI bridge is temporarily saturated. Retry the request shortly.",
        {
          reasonCode: "transport.transient_failure",
          details: {
            reason: "concurrency_limit_exceeded",
            activeExecutions: this.#activeExecutions,
            maxConcurrent: this.#maxConcurrent,
          },
        },
      );
    }

    const profile = this.#resolveCliProfile(request.cliType, modelId);
    const timeoutMs = this.#resolveTimeout(request.timeoutMs);
    const thinkingLevel = normalizeThinkingLevel(request.thinkingLevel);
    const sessionId = normalizeNonEmpty(request.sessionId ?? "", "");
    const explicitResumeSessionId =
      profile.id === CLI_TYPE_COPILOT
        ? normalizeNonEmpty(request.resumeSessionId ?? "", "")
        : "";
    const continuationKey =
      profile.id === CLI_TYPE_COPILOT &&
        sessionId.length > 0
        ? `${sessionId}::${providerId}::${modelId}`
        : undefined;
    const resumeSessionId =
      explicitResumeSessionId.length > 0
        ? explicitResumeSessionId
        : continuationKey !== undefined
          ? this.#copilotSessionIdsByContinuationKey.get(continuationKey)
          : undefined;
    const continueSession =
      continuationKey !== undefined &&
      resumeSessionId === undefined &&
      this.#copilotContinuationKeys.has(continuationKey);

    // When continuing or resuming a CLI session, the CLI already has the full
    // conversation context internally. Only send the latest user message as the
    // prompt to avoid redundantly passing the entire system prompt, tool
    // definitions, and conversation history on every turn.
    const isSessionContinuation = continueSession || resumeSessionId !== undefined;
    const prompt = isSessionContinuation
      ? this.#buildPromptLastUserMessage(request.messages)
      : this.#buildPrompt(request.messages);

    const commandArgCandidates = this.#buildCommandArgCandidates({
      profile,
      modelId,
      prompt,
      thinkingLevel,
      continueSession,
      ...(resumeSessionId !== undefined ? { resumeSessionId } : {}),
    });
    const commandPath = this.#commands[profile.id];

    this.#activeExecutions += 1;
    try {
      let commandResult: RunCommandResult | undefined;
      let lastError: CliChatExecutionError | undefined;
      for (const args of commandArgCandidates) {
        try {
          commandResult = await this.#runCommand(
            commandPath,
            args,
            timeoutMs,
            profile.id,
          );
          break;
        } catch (error) {
          if (!(error instanceof CliChatExecutionError)) {
            throw error;
          }

          lastError = error;
          if (this.#isRecoverableOptionalFlagError(error)) {
            continue;
          }

          throw error;
        }
      }

      if (commandResult === undefined) {
        throw lastError ??
        new CliChatExecutionError("CLI execution failed with unsupported configuration.", {
          reasonCode: "provider.unavailable",
        });
      }

      const content = this.#extractAssistantContent(
        commandResult.stdout,
        commandResult.stderr,
      );
      const cliSessionId =
        profile.id === CLI_TYPE_COPILOT
          ? parseCopilotSessionIdFromOutput(commandResult.stdout)
          : undefined;
      if (continuationKey !== undefined) {
        this.#copilotContinuationKeys.add(continuationKey);
        if (cliSessionId !== undefined) {
          this.#copilotSessionIdsByContinuationKey.set(continuationKey, cliSessionId);
        }
        this.#evictOldContinuationEntries();
      }
      return {
        correlationId,
        providerId,
        modelId,
        content,
        ...(cliSessionId !== undefined ? { cliSessionId } : {}),
      };
    } finally {
      this.#activeExecutions -= 1;
    }
  }

  #evictOldContinuationEntries(): void {
    while (this.#copilotContinuationKeys.size > MAX_SESSION_CONTINUATION_KEYS) {
      const oldest = this.#copilotContinuationKeys.values().next().value as
        | string
        | undefined;
      if (oldest === undefined) {
        break;
      }
      this.#copilotContinuationKeys.delete(oldest);
      this.#copilotSessionIdsByContinuationKey.delete(oldest);
    }
  }

  async #discoverModels(profile: CliProfile): Promise<readonly CliModelDescriptor[]> {
    const commandPath = this.#commands[profile.id];
    const discoveryCommands: readonly string[][] =
      profile.id === CLI_TYPE_COPILOT
        ? [
          ["models", "--output-format", "json"],
          ["models", "list", "--output-format", "json"],
          ["model", "list", "--output-format", "json"],
          ["model", "--output-format", "json"],
        ]
        : [
          ["models", "--output-format", "json"],
          ["models", "list", "--output-format", "json"],
          ["model", "list", "--output-format", "json"],
          ["model", "--output-format", "json"],
        ];

    for (const args of discoveryCommands) {
      try {
        const result = await this.#runCommand(
          commandPath,
          args,
          6_000,
          profile.id,
        );
        const parsed = parseModelCatalogFromOutput(result.stdout, result.stderr);
        if (parsed.length > 0) {
          return parsed;
        }
      } catch {
        // Best-effort discovery. Fall back to known catalog.
      }
    }

    return [];
  }

  #buildCommandArgCandidates(options: {
    profile: CliProfile;
    modelId: string;
    prompt: string;
    thinkingLevel: string | undefined;
    continueSession: boolean;
    resumeSessionId?: string;
  }): readonly string[][] {
    const buildBaseVariants = (sessionOptions: {
      continueSession?: boolean;
      resumeSessionId?: string;
    }): string[][] => {
      const baseArgs = [...options.profile.buildCommandArgs({
        modelId: options.modelId,
        prompt: options.prompt,
        ...(sessionOptions.continueSession !== undefined
          ? { continueSession: sessionOptions.continueSession }
          : {}),
        ...(sessionOptions.resumeSessionId !== undefined
          ? { resumeSessionId: sessionOptions.resumeSessionId }
          : {}),
        ...(options.profile.id === CLI_TYPE_COPILOT &&
          this.#disableCopilotBuiltinMcps
          ? { disableBuiltinMcps: true }
          : {}),
      })];

      if (
        options.profile.id !== CLI_TYPE_COPILOT ||
        options.thinkingLevel === undefined
      ) {
        return [baseArgs];
      }

      const effortMap: Record<string, string> = {
        [THINKING_LEVEL_LOW]: "low",
        [THINKING_LEVEL_MED]: "medium",
        [THINKING_LEVEL_HIGH]: "high",
        [THINKING_LEVEL_XHIGH]: "high",
      };

      return [
        [...baseArgs, "--thinking-level", options.thinkingLevel],
        [...baseArgs, "--reasoning-effort", effortMap[options.thinkingLevel] ?? "medium"],
        [...baseArgs, "--effort", effortMap[options.thinkingLevel] ?? "medium"],
        baseArgs,
      ];
    };

    const sessionVariants: Array<{
      continueSession?: boolean;
      resumeSessionId?: string;
    }> = [];
    if (options.resumeSessionId !== undefined) {
      sessionVariants.push({ resumeSessionId: options.resumeSessionId });
      sessionVariants.push({ continueSession: true });
      sessionVariants.push({});
    } else if (options.continueSession) {
      sessionVariants.push({ continueSession: true });
      sessionVariants.push({});
    } else {
      sessionVariants.push({});
    }

    const variants = sessionVariants.flatMap((sessionVariant) =>
      buildBaseVariants(sessionVariant),
    );

    const unique = new Map<string, string[]>();
    for (const variant of variants) {
      unique.set(variant.join("\u0000"), variant);
    }
    return [...unique.values()];
  }

  #isRecoverableOptionalFlagError(error: CliChatExecutionError): boolean {
    if (error.reasonCode !== "provider.unavailable" || error.details === undefined) {
      return false;
    }

    const stderr =
      typeof error.details["stderr"] === "string"
        ? error.details["stderr"].toLowerCase()
        : "";
    if (stderr.length === 0) {
      return false;
    }

    const unknownOptionPattern =
      stderr.includes("unknown option") ||
      stderr.includes("unknown argument") ||
      stderr.includes("unexpected argument") ||
      stderr.includes("invalid option") ||
      stderr.includes("not recognized");
    if (!unknownOptionPattern) {
      return false;
    }

    return (
      stderr.includes("--thinking-level") ||
      stderr.includes("--reasoning-effort") ||
      stderr.includes("--effort") ||
      stderr.includes("--continue") ||
      stderr.includes("--resume")
    );
  }

  #resolveCliProfile(cliType: string | undefined, modelId?: string): CliProfile {
    const normalizedType = normalizeNonEmpty(cliType ?? "", "");
    if (normalizedType.length > 0) {
      if (normalizedType === CLI_TYPE_COPILOT || normalizedType === CLI_TYPE_CLAUDE) {
        return CLI_PROFILES[normalizedType];
      }
      throw new CliChatExecutionError(`Unsupported CLI type: ${normalizedType}.`, {
        reasonCode: "request.invalid",
        details: { cliType: normalizedType },
      });
    }

    if (modelId !== undefined && modelId.toLowerCase() === CLI_TYPE_CLAUDE) {
      return CLI_PROFILES[CLI_TYPE_CLAUDE];
    }
    return CLI_PROFILES[CLI_TYPE_COPILOT];
  }

  #resolveTimeout(timeoutMs: number | undefined): number {
    if (timeoutMs === undefined) {
      return DEFAULT_TIMEOUT_MS;
    }
    return clampInteger(timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  }

  #buildPrompt(messages: readonly CliChatMessage[]): string {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new CliChatExecutionError(
        "CLI chat request requires at least one message.",
        {
          reasonCode: "request.invalid",
        },
      );
    }

    if (messages.length > MAX_MESSAGES) {
      throw new CliChatExecutionError(
        `CLI chat request exceeds max message count (${String(MAX_MESSAGES)}).`,
        {
          reasonCode: "request.invalid",
          details: {
            maxMessages: MAX_MESSAGES,
            messageCount: messages.length,
          },
        },
      );
    }

    const rendered: string[] = [];
    let totalChars = 0;
    for (const message of messages) {
      if (
        (message.role !== "system" &&
          message.role !== "user" &&
          message.role !== "assistant") ||
        typeof message.content !== "string"
      ) {
        throw new CliChatExecutionError(
          "CLI chat request includes an invalid message entry.",
          {
            reasonCode: "request.invalid",
          },
        );
      }

      const normalizedContent = message.content.trim();
      if (normalizedContent.length === 0) {
        throw new CliChatExecutionError(
          "CLI chat request messages must not be empty.",
          {
            reasonCode: "request.invalid",
          },
        );
      }

      totalChars += normalizedContent.length;
      if (totalChars > MAX_PROMPT_CHARS) {
        throw new CliChatExecutionError(
          `CLI chat request exceeds max prompt length (${String(MAX_PROMPT_CHARS)} characters).`,
          {
            reasonCode: "request.invalid",
            details: {
              maxPromptChars: MAX_PROMPT_CHARS,
              promptChars: totalChars,
            },
          },
        );
      }

      rendered.push(`${message.role}: ${normalizedContent}`);
    }

    return rendered.join("\n");
  }

  /**
   * Extract only the last user message from the messages array.
   * Used for session continuations where the CLI already has the full context.
   */
  #buildPromptLastUserMessage(messages: readonly CliChatMessage[]): string {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new CliChatExecutionError(
        "CLI chat request requires at least one message.",
        {
          reasonCode: "request.invalid",
        },
      );
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.role === "user" && typeof message.content === "string") {
        const content = message.content.trim();
        if (content.length > 0) {
          return content;
        }
      }
    }

    // No user message found — fall back to full prompt to avoid sending empty
    return this.#buildPrompt(messages);
  }

  #extractAssistantContent(stdout: string, stderr: string): string {
    const lines = stdout.split(/\r?\n/);
    let parsedRecords = 0;
    let assistantContent: string | undefined;
    let structuredErrorMessage: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        continue;
      }
      parsedRecords += 1;

      const parsedError = parseModelErrorFromJson(payload);
      if (parsedError !== undefined) {
        const normalizedError = safeTextExcerpt(parsedError);
        if (normalizedError.length > 0) {
          structuredErrorMessage = normalizedError;
        }
        continue;
      }

      if (isRecord(payload) && payload["type"] === "assistant.message") {
        const data = payload["data"];
        if (isRecord(data) && typeof data["content"] === "string") {
          const content = data["content"].trim();
          if (content.length > 0) {
            assistantContent = content;
            continue;
          }
        }
      }

      const extracted = parseModelContentFromJson(payload);
      if (extracted !== undefined) {
        assistantContent = extracted;
      }
    }

    if (assistantContent !== undefined) {
      return assistantContent;
    }

    if (structuredErrorMessage !== undefined) {
      throw new CliChatExecutionError(structuredErrorMessage, {
        reasonCode: "provider.unavailable",
        details: {
          reason: "provider_error_payload",
          stdout: safeTextExcerpt(stdout),
          stderr: safeTextExcerpt(stderr),
        },
      });
    }

    const plainTextStdout = stdout.trim();
    if (parsedRecords === 0 && plainTextStdout.length > 0) {
      return plainTextStdout;
    }

    throw new CliChatExecutionError(
      "CLI output did not include an assistant response.",
      {
        reasonCode: "provider.unavailable",
        details: {
          reason:
            parsedRecords === 0 ? "jsonl_parse_failed" : "assistant_content_missing",
          stdout: safeTextExcerpt(stdout),
          stderr: safeTextExcerpt(stderr),
        },
      },
    );
  }

  async #runCommand(
    commandPath: string,
    args: readonly string[],
    timeoutMs: number,
    cliType: SupportedCliType,
  ): Promise<RunCommandResult> {
    const commandCandidates = this.#resolveCommandCandidates(commandPath);
    let lastError: CliChatExecutionError | undefined;

    for (const candidate of commandCandidates) {
      try {
        return await this.#runCommandOnce(candidate, args, timeoutMs, cliType);
      } catch (error) {
        if (!(error instanceof CliChatExecutionError)) {
          throw error;
        }

        lastError = error;
        if (!this.#isCommandNotFoundError(error)) {
          throw error;
        }
      }
    }

    if (lastError !== undefined) {
      throw lastError;
    }

    throw new CliChatExecutionError("CLI command execution failed unexpectedly.", {
      reasonCode: "provider.unavailable",
      details: {
        command: commandPath,
        cliType,
        reason: "command_resolution_failed",
      },
    });
  }

  #resolveCommandCandidates(commandPath: string): readonly string[] {
    const normalized = commandPath.trim();
    if (normalized.length === 0) {
      return [];
    }

    const windowsResolved =
      process.platform === "win32"
        ? this.#resolveCommandFromPath(normalized, this.#spawnEnv)
        : undefined;
    const resolvedCommand = windowsResolved ?? normalized;

    if (!shouldTryWindowsExecutableSuffixes(resolvedCommand)) {
      return [resolvedCommand];
    }

    const candidates = [
      resolvedCommand,
      `${resolvedCommand}.cmd`,
      `${resolvedCommand}.exe`,
      `${resolvedCommand}.bat`,
    ];
    return [...new Set(candidates)];
  }

  #isCommandNotFoundError(error: CliChatExecutionError): boolean {
    if (error.reasonCode !== "provider.unavailable") {
      return false;
    }

    const details = error.details;
    const errorCode =
      details !== undefined && typeof details["errorCode"] === "string"
        ? details["errorCode"].toUpperCase()
        : "";
    if (errorCode === "ENOENT") {
      return true;
    }

    return error.message.includes("ENOENT");
  }

  #createSpawnInvocation(commandPath: string, args: readonly string[]): {
    command: string;
    args: readonly string[];
    windowsVerbatimArguments?: boolean;
  } {
    if (!isWindowsCmdWrapper(commandPath)) {
      return {
        command: commandPath,
        args: [...args],
      };
    }

    const shellCommand = [
      escapeWindowsCommand(commandPath),
      ...args.map((arg) => escapeWindowsCommandArgument(arg, true)),
    ].join(" ");
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `"${shellCommand}"`],
      windowsVerbatimArguments: true,
    };
  }

  async #runCommandOnce(
    commandPath: string,
    args: readonly string[],
    timeoutMs: number,
    cliType: SupportedCliType,
  ): Promise<RunCommandResult> {
    const spawnInvocation = this.#createSpawnInvocation(commandPath, args);
    let child: ChildProcess;
    try {
      child = this.#spawnFn(spawnInvocation.command, [...spawnInvocation.args], {
        shell: false,
        windowsHide: true,
        ...(spawnInvocation.windowsVerbatimArguments === true
          ? { windowsVerbatimArguments: true }
          : {}),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      const errorCode =
        typeof (cause as NodeJS.ErrnoException).code === "string"
          ? (cause as NodeJS.ErrnoException).code
          : undefined;
      throw new CliChatExecutionError(
        `Failed to start CLI command "${commandPath}": ${cause.message}`,
        {
          reasonCode: "provider.unavailable",
          details: {
            command: commandPath,
            cliType,
            reason: "spawn_failed",
            spawnCommand: spawnInvocation.command,
            ...(errorCode !== undefined ? { errorCode } : {}),
          },
          cause,
        },
      );
    }

    return new Promise<RunCommandResult>((resolve, reject) => {
      let settled = false;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const rejectOnce = (error: CliChatExecutionError): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      };

      const resolveOnce = (result: RunCommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve(result);
      };

      const timeoutHandle = setTimeout(() => {
        void this.#terminateChildProcess(child);
        rejectOnce(
          new CliChatExecutionError(
            `CLI execution timed out after ${String(timeoutMs)}ms.`,
            {
              reasonCode: "transport.timeout",
              details: {
                timeoutMs,
                command: commandPath,
                cliType,
              },
            },
          ),
        );
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer | string) => {
        if (settled) return;

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += buffer.length;
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          void this.#terminateChildProcess(child);
          rejectOnce(
            new CliChatExecutionError(
              "CLI output exceeded the maximum allowed size.",
              {
                reasonCode: "provider.unavailable",
                details: {
                  reason: "output_limit_exceeded",
                  command: commandPath,
                  cliType,
                  maxStdoutBytes: MAX_STDOUT_BYTES,
                },
              },
            ),
          );
          return;
        }

        stdoutChunks.push(buffer);
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        if (settled) return;

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_STDERR_BYTES - stderrBytes;
        if (remaining > 0) {
          stderrChunks.push(buffer.subarray(0, remaining));
        }
        stderrBytes += buffer.length;
      });

      child.once("error", (error) => {
        const cause = error instanceof Error ? error : new Error(String(error));
        const errorCode =
          typeof (cause as NodeJS.ErrnoException).code === "string"
            ? (cause as NodeJS.ErrnoException).code
            : undefined;
        rejectOnce(
          new CliChatExecutionError(
            `CLI process failed: ${cause.message}`,
            {
              reasonCode: "provider.unavailable",
              details: {
                command: commandPath,
                cliType,
                reason: "process_error",
                spawnCommand: spawnInvocation.command,
                ...(errorCode !== undefined ? { errorCode } : {}),
              },
              cause,
            },
          ),
        );
      });

      child.once("close", (code, signal) => {
        if (settled) return;

        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        if (code !== 0) {
          const providerErrorMessage = extractStructuredCliErrorMessage(stdout, stderr);
          rejectOnce(
            new CliChatExecutionError(
              providerErrorMessage ?? `CLI process exited with code ${String(code)}.`,
              {
                reasonCode: "provider.unavailable",
                details: {
                  command: commandPath,
                  cliType,
                  spawnCommand: spawnInvocation.command,
                  exitCode: code ?? -1,
                  ...(signal !== null ? { signal } : {}),
                  ...(providerErrorMessage !== undefined
                    ? { providerErrorMessage }
                    : {}),
                  stderr: safeTextExcerpt(stderr),
                  stdout: safeTextExcerpt(stdout),
                },
              },
            ),
          );
          return;
        }

        resolveOnce({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });
    });
  }

  async #terminateChildProcess(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) {
      return;
    }

    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Ignore force-kill failures.
          }
        }
        resolve();
      }, TERMINATION_GRACE_MS);

      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

