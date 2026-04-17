import fs from "node:fs";
import path from "node:path";
import {
	type Query,
	query,
	type SDKMessage,
	type SDKUserMessage,
	type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";
import type { Attachment } from "@/lib/types";
import { buildContentBlocks } from "./content-blocks";
import { buildFullPrompt } from "./prompt-builder";
import { type StreamAgentOptions, streamViaSandbox } from "./sandbox-runner";
import {
	AGENT_ALLOWED_TOOLS,
	AGENT_ENV_KEYS,
	AGENT_MODEL,
	collectEnvVars,
	getAgentDefinitions,
	getSystemPrompt,
} from "./system-prompt";

// Local SDK execution spawns subprocesses (Bash tool, etc.), so PATH/HOME must
// be inherited. Sandbox execution gets these from the sandbox process itself.
const LOCAL_AGENT_ENV_KEYS = [...AGENT_ENV_KEYS, "PATH", "HOME"];

export { extractThinkingFromMessage } from "./message-extraction";
export type { Query, StreamAgentOptions };

export function getClaudeCodeCliPath(): string {
	const cliPath = path.join(
		process.cwd(),
		"node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
	);

	if (!fs.existsSync(cliPath)) {
		throw new Error(
			`Claude Agent SDK CLI not found at ${cliPath}. The SDK requires the CLI to be present.`,
		);
	}

	return cliPath;
}

export async function* streamAgentResponse(
	options: StreamAgentOptions,
): AsyncGenerator<SDKMessage> {
	yield* streamViaSandbox(options);
}

async function* singleMessageStream(
	message: string,
	attachments?: Attachment[],
): AsyncGenerator<SDKUserMessage> {
	yield {
		type: "user",
		session_id: "",
		message: {
			role: "user",
			content: buildContentBlocks(message, attachments),
		},
		parent_tool_use_id: null,
	};
}

interface QueryOptionsInput {
	workspacePath: string;
	abortController: AbortController;
	claudeOauthToken: string;
	timezone?: string;
	userFirstName?: string;
	userPreferences?: string;
	agentSessionId?: string;
}

function buildQueryOptions(opts: QueryOptionsInput) {
	return {
		cwd: opts.workspacePath,
		model: AGENT_MODEL,
		pathToClaudeCodeExecutable: getClaudeCodeCliPath(),
		settingSources: ["project"] satisfies SettingSource[],
		allowedTools: AGENT_ALLOWED_TOOLS,
		permissionMode: "acceptEdits" as const,
		systemPrompt: {
			type: "preset" as const,
			preset: "claude_code" as const,
			append: getSystemPrompt(
				opts.timezone,
				opts.userFirstName,
				opts.userPreferences,
			),
		},
		agents: getAgentDefinitions(opts.timezone, opts.userFirstName),
		env: {
			...collectEnvVars(LOCAL_AGENT_ENV_KEYS),
			CLAUDE_CODE_OAUTH_TOKEN: opts.claudeOauthToken,
		},
		abortController: opts.abortController,
		includePartialMessages: true,
		maxThinkingTokens: 10000,
		resume: opts.agentSessionId,
	};
}

export function createLocalAgentQuery({
	prompt,
	workspacePath,
	claudeOauthToken,
	conversationHistory = [],
	abortController = new AbortController(),
	timezone,
	userFirstName,
	userPreferences,
	agentSessionId,
	attachments,
}: StreamAgentOptions): Query {
	const effectivePrompt = agentSessionId
		? prompt
		: buildFullPrompt(prompt, conversationHistory);

	return query({
		prompt: singleMessageStream(effectivePrompt, attachments),
		options: buildQueryOptions({
			workspacePath,
			abortController,
			claudeOauthToken,
			timezone,
			userFirstName,
			userPreferences,
			agentSessionId,
		}),
	});
}
