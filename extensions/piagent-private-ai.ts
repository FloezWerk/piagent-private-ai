/**
 * piagent-private-ai.ts (Pi extension)
 *
 * Registers "private-ai" as a Pi model provider backed by the Privatemode
 * proxyless API (https://docs.privatemode.ai/api/proxyless-api/), an
 * OpenAI-compatible chat completions endpoint operated inside confidential
 * computing environments.
 *
 * - Models are registered statically from the Privatemode model overview
 *   (https://docs.privatemode.ai/models/overview/).
 * - Authentication reads the `PRIVATEMODE_API_KEY` environment variable
 *   (create the key in the Privatemode portal).
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

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const COMMAND_NAME = "private-ai";
const PROVIDER_ID = "private-ai";
const BASE_URL = "https://proxyless-api.privatemode.ai/v1";
const API_KEY_ENV = "PRIVATEMODE_API_KEY";
const DOCS_URL = "https://docs.privatemode.ai/models/overview/";

/**
 * Privatemode prices are EUR per million tokens (see
 * https://docs.privatemode.ai/pricing/). Pi treats these numbers as display
 * cost per million tokens; the EUR values are used as-is.
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
	pi.registerProvider(PROVIDER_ID, {
		name: "Private AI (Privatemode)",
		baseUrl: BASE_URL,
		apiKey: `$${API_KEY_ENV}`,
		api: "openai-completions",
		models: MODELS.map((model) => ({
			type: "chat" as const,
			id: model.id,
			name: model.name,
			api: "openai-completions" as const,
			baseUrl: BASE_URL,
			input: model.input,
			cost: model.cost,
			reasoning: model.reasoning,
			thinkingLevelMap: model.thinkingLevelMap,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
		})),
	});

	pi.registerCommand(COMMAND_NAME, {
		description:
			"Show private-ai (Privatemode) provider status, or `/private-ai <model-id>` to switch models",
		handler: async (args: string, ctx: ExtensionContext): Promise<void> => {
			const target = args.trim();

			if (!target) {
				if (!ctx.hasUI) return;

				const models = ctx.modelRegistry.getModelsOfType("chat", PROVIDER_ID);
				const lines = models.map((model) => {
					const current = ctx.model?.provider === PROVIDER_ID && ctx.model?.id === model.id;
					return `${current ? "*" : "-"} ${model.id} (${model.contextWindow.toLocaleString("en-US")} ctx, ${model.input.join("/")})`;
				});
				const keyStatus = hasApiKey()
					? `API key: set via ${API_KEY_ENV}`
					: `API key: NOT set - export ${API_KEY_ENV}=<your key>`;
				const currentModel =
					ctx.model?.provider === PROVIDER_ID ? `\nCurrent model: ${ctx.model.id}` : "";
				ctx.ui.notify(
					`private-ai (Privatemode)\n${keyStatus}${currentModel}\nModels:\n${lines.join("\n")}\nSwitch with /${COMMAND_NAME} <model-id>. Model docs: ${DOCS_URL}`,
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
					`private-ai: cannot switch to ${model.id} - authentication is not configured (set ${API_KEY_ENV}).`,
					"error",
				);
			}
		},
	});
}
