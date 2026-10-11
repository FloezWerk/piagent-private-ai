/**
 * piagent-private-ai.ts (Pi extension)
 *
 * Registers "private-ai" as a Pi model provider backed by Privatemode
 * (https://docs.privatemode.ai/), an OpenAI-compatible chat completions
 * service operated inside confidential computing environments.
 *
 * Two connection modes (see `privateAi` in settings.json):
 *
 * - "proxyless" (default): calls the hosted proxyless API at
 *   https://proxyless-api.privatemode.ai/v1. Memory encryption without
 *   client-side attestation.
 * - "proxy": calls a locally running Privatemode proxy (default
 *   http://localhost:8080/v1), which verifies the backend attestation and
 *   transparently encrypts prompts client-side. Configure `proxyBaseUrl` and
 *   optionally `proxyApiKey` for a remote/self-hosted proxy.
 *
 * - Models are registered statically from the Privatemode model overview
 *   (https://docs.privatemode.ai/models/overview/).
 * - Authentication reads the `PRIVATEMODE_API_KEY` environment variable
 *   unless `proxyApiKey` is set (supports `$ENV` interpolation, literal, or
 *   `!command`, like models.json).
 * - Reasoning: Privatemode chat models always reason; on
 *   `/v1/chat/completions` the reasoning text is returned in the `reasoning`
 *   field, which the built-in openai-completions implementation maps to
 *   thinking content. The pi thinking level is forwarded as `reasoning_effort`
 *   via `thinkingLevelMap`.
 * - `/private-ai` shows provider status, `/private-ai <model-id>` switches the
 *   current session model to a registered private-ai model.
 *
 * All user-facing strings and comments stay English (see AGENTS.md).
 */

import type { ExtensionAPI, ExtensionContext, Settings } from "@earendil-works/pi-coding-agent";

const COMMAND_NAME = "private-ai";
const PROVIDER_ID = "private-ai";
const PROXYLESS_BASE_URL = "https://proxyless-api.privatemode.ai/v1";
const PROXY_BASE_URL = "http://localhost:8080/v1";
const API_KEY_ENV = "PRIVATEMODE_API_KEY";
const DOCS_URL = "https://docs.privatemode.ai/models/overview/";

/**
 * Extension settings (nested under `privateAi` in settings.json; the Settings
 * type does not declare third-party keys, hence the cast below).
 */
interface PrivateAiSettings {
	/** "proxyless" (default) or "proxy". */
	mode?: string;
	/** Base URL of the local/remote Privatemode proxy in "proxy" mode. */
	proxyBaseUrl?: string;
	/** API key for the proxy; supports $ENV interpolation, literal, or !command. */
	proxyApiKey?: string;
}

function readPrivateAiSettings(pi: ExtensionAPI): PrivateAiSettings {
	const settings = pi.getSettings() as Settings & { privateAi?: PrivateAiSettings };
	const raw = settings.privateAi;
	if (!raw || typeof raw !== "object") return {};
	return {
		mode: typeof raw.mode === "string" ? raw.mode : undefined,
		proxyBaseUrl: typeof raw.proxyBaseUrl === "string" ? raw.proxyBaseUrl : undefined,
		proxyApiKey: typeof raw.proxyApiKey === "string" ? raw.proxyApiKey : undefined,
	};
}

/** Resolve the effective connection settings for the configured mode. */
function resolveConnection(pi: ExtensionAPI): { baseUrl: string; apiKey: string; mode: string } {
	const settings = readPrivateAiSettings(pi);
	if (settings.mode?.trim().toLowerCase() === "proxy") {
		return {
			mode: "proxy",
			baseUrl: (settings.proxyBaseUrl?.trim() || PROXY_BASE_URL).replace(/\/+$/, ""),
			// Fall back to the standard env var when the proxy does not need its own key.
			apiKey: settings.proxyApiKey?.trim() || `$${API_KEY_ENV}`,
		};
	}
	return { mode: "proxyless", baseUrl: PROXYLESS_BASE_URL, apiKey: `$${API_KEY_ENV}` };
}

/**
 * Privatemode prices are EUR per million tokens (see
 * https://docs.privatemode.ai/pricing/). Pi treats these numbers as display
 * cost per million tokens; the EUR values are used as-is. The local proxy
 * forwards to the same backend, so pricing applies in both modes.
 */
const GLM_5_3_COST = { input: 1.55, output: 5.74, cacheRead: 0.15, cacheWrite: 0 };
const FLASH_COST = { input: 0.2, output: 0.65, cacheRead: 0.05, cacheWrite: 0 };
const GPT_OSS_COST = { input: 0.2, output: 0.65, cacheRead: 0.04, cacheWrite: 0 };

/** GLM models accept `low`, `high` and `max`; reasoning cannot be disabled. */
const GLM_THINKING_LEVELS = {
	off: null,
	minimal: "low",
	low: "low",
	medium: "high",
	high: "high",
	xhigh: "max",
	max: "max",
} as const;

/** gpt-oss models accept `low`, `medium` and `high`. */
const GPT_OSS_THINKING_LEVELS = {
	off: null,
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "high",
	max: "high",
} as const;

interface PrivateAiModelSpec {
	id: string;
	name: string;
	input: ("text" | "image")[];
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	thinkingLevelMap: Record<string, string | null>;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/**
 * Chat models from the Privatemode overview. Embedding, speech-to-text and
 * the DeepSeek-OCR-2 models are not exposed as chat models (OCR requires a
 * special prompt format and is not suitable for a coding agent).
 */
const MODELS: PrivateAiModelSpec[] = [
	{
		id: "glm-5.3",
		name: "GLM 5.3 (Private AI)",
		input: ["text"],
		contextWindow: 1_000_000,
		maxTokens: 32768,
		reasoning: true,
		thinkingLevelMap: { ...GLM_THINKING_LEVELS },
		cost: GLM_5_3_COST,
	},
	{
		id: "glm-latest",
		name: "GLM latest (Private AI)",
		input: ["text"],
		contextWindow: 1_000_000,
		maxTokens: 32768,
		reasoning: true,
		thinkingLevelMap: { ...GLM_THINKING_LEVELS },
		cost: GLM_5_3_COST,
	},
	{
		id: "glm-5.3-flash",
		name: "GLM 5.3 Flash (Private AI)",
		input: ["text", "image"],
		contextWindow: 1_000_000,
		maxTokens: 32768,
		reasoning: true,
		thinkingLevelMap: { ...GLM_THINKING_LEVELS },
		cost: FLASH_COST,
	},
	{
		id: "glm-flash-latest",
		name: "GLM Flash latest (Private AI)",
		input: ["text", "image"],
		contextWindow: 1_000_000,
		maxTokens: 32768,
		reasoning: true,
		thinkingLevelMap: { ...GLM_THINKING_LEVELS },
		cost: FLASH_COST,
	},
	{
		id: "gpt-oss-120b",
		name: "gpt-oss-120b (Private AI)",
		input: ["text"],
		contextWindow: 128_000,
		maxTokens: 32768,
		reasoning: true,
		thinkingLevelMap: { ...GPT_OSS_THINKING_LEVELS },
		cost: GPT_OSS_COST,
	},
];

function hasApiKey(): boolean {
	return Boolean(process.env[API_KEY_ENV]?.trim());
}

export default async function piagentPrivateAi(pi: ExtensionAPI): Promise<void> {
	/**
	 * Register (or re-register on /reload) once the runtime is ready:
	 * pi.getSettings() is not available while the extension factory loads.
	 */
	function registerFromSettings(api: ExtensionAPI): void {
		const connection = resolveConnection(api);
		api.registerProvider(PROVIDER_ID, {
			name: "Private AI (Privatemode)",
			baseUrl: connection.baseUrl,
			apiKey: connection.apiKey,
			api: "openai-completions",
			models: MODELS.map((model) => ({
				type: "chat" as const,
				id: model.id,
				name: model.name,
				api: "openai-completions" as const,
				baseUrl: connection.baseUrl,
				input: model.input,
				cost: model.cost,
				reasoning: model.reasoning,
				thinkingLevelMap: model.thinkingLevelMap,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
			})),
		});
	}

	// registerProvider throws while the runtime is not yet initialized (during
	// initial extension loading); session_start then performs the registration.
	try {
		registerFromSettings(pi);
	} catch {
		// Handled by the session_start handler.
	}

	pi.on("session_start", () => {
		registerFromSettings(pi);
	});

	pi.registerCommand(COMMAND_NAME, {
		description:
			"Show private-ai (Privatemode) provider status, or `/private-ai <model-id>` to switch models",
		handler: async (args: string, ctx: ExtensionContext): Promise<void> => {
			const target = args.trim();

			if (!target) {
				if (!ctx.hasUI) return;

				const connection = resolveConnection(pi);
				const models = ctx.modelRegistry.getModelsOfType("chat", PROVIDER_ID);
				const lines = models.map((model) => {
					const current = ctx.model?.provider === PROVIDER_ID && ctx.model?.id === model.id;
					return `${current ? "*" : "-"} ${model.id} (${model.contextWindow.toLocaleString("en-US")} ctx, ${model.input.join("/")})`;
				});
				const keyStatus = hasApiKey() || connection.apiKey !== `$${API_KEY_ENV}`
					? `API key: configured (env ${API_KEY_ENV} or settings)`
					: `API key: NOT set - export ${API_KEY_ENV}=<your key>`;
				const currentModel =
					ctx.model?.provider === PROVIDER_ID ? `\nCurrent model: ${ctx.model.id}` : "";
				ctx.ui.notify(
					`private-ai (Privatemode)\nMode: ${connection.mode}\nBase URL: ${connection.baseUrl}\n${keyStatus}${currentModel}\nModels:\n${lines.join("\n")}\nSwitch with /${COMMAND_NAME} <model-id>. Model docs: ${DOCS_URL}`,
					"info",
				);
				return;
			}

			const model = ctx.modelRegistry.find(PROVIDER_ID, target);
			if (!model) {
				if (!ctx.hasUI) return;
				ctx.ui.notify(
					`private-ai: unknown model "${target}". Use /${COMMAND_NAME} to list models.`,
					"error",
				);
				return;
			}

			const switched = await ctx.setModel(model);
			if (!ctx.hasUI) return;
			if (switched) {
				ctx.ui.notify(`private-ai: model switched to ${model.id}.`, "info");
			} else {
				ctx.ui.notify(
					`private-ai: cannot switch to ${model.id} - authentication is not configured (set ${API_KEY_ENV} or privateAi.proxyApiKey).`,
					"error",
				);
			}
		},
	});
}
