import fs from "node:fs";
import path from "node:path";
import {
	type Query,
	query,
	type SDKMessage,
	type SDKUserMessage,
	type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";
import { buildFullPrompt } from "./prompt-builder";
import { type StreamAgentOptions, streamViaSandbox } from "./sandbox-runner";
import {
	AGENT_ALLOWED_TOOLS,
	AGENT_MODEL,
	getSystemPrompt,
} from "./system-prompt";

export type { Query, StreamAgentOptions };
export { extractThinkingFromMessage } from "./message-extraction";

function getClaudeCodeCliPath(): string {
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
	text: string,
): AsyncGenerator<SDKUserMessage> {
	const message: SDKUserMessage = {
		type: "user",
		session_id: "",
		message: {
			role: "user",
			content: [{ type: "text", text }],
		},
		parent_tool_use_id: null,
	};
	yield message;
}

interface QueryOptionsInput {
	workspacePath: string;
	abortController: AbortController;
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
		abortController: opts.abortController,
		includePartialMessages: true,
		maxThinkingTokens: 10000,
		resume: opts.agentSessionId,
	};
}

export function createLocalAgentQuery({
	prompt,
	workspacePath,
	conversationHistory = [],
	abortController = new AbortController(),
	timezone,
	userFirstName,
	userPreferences,
	agentSessionId,
}: StreamAgentOptions): Query {
	const effectivePrompt = agentSessionId
		? prompt
		: buildFullPrompt(prompt, conversationHistory);

	return query({
		prompt: singleMessageStream(effectivePrompt),
		options: buildQueryOptions({
			workspacePath,
			abortController,
			timezone,
			userFirstName,
			userPreferences,
			agentSessionId,
		}),
	});
}
