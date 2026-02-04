import fs from "node:fs";
import path from "node:path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

function getClaudeCodeCliPath(): string {
	const cliPath = path.join(
		process.cwd(),
		"node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
	);
	console.log("[Agent] CWD:", process.cwd());
	console.log("[Agent] CLI path:", cliPath);
	const cliExists = fs.existsSync(cliPath);
	console.log("[Agent] CLI exists:", cliExists);

	if (!cliExists) {
		// List what's in node_modules/@anthropic-ai for debugging
		const anthropicDir = path.join(process.cwd(), "node_modules/@anthropic-ai");
		if (fs.existsSync(anthropicDir)) {
			console.log(
				"[Agent] Contents of @anthropic-ai:",
				fs.readdirSync(anthropicDir),
			);
		} else {
			console.log("[Agent] @anthropic-ai directory does not exist");
		}
		throw new Error(
			`Claude Agent SDK CLI not found at ${cliPath}. The SDK requires the CLI to be present.`,
		);
	}

	return cliPath;
}

const SYSTEM_PROMPT_APPEND = `You are Fortuna, an AI sports betting analyst.

You help users analyze betting opportunities by:
- Fetching current odds using the odds-api skill (invoke it when users ask about odds)
- Researching team stats, injuries, and news via web search
- Writing analysis scripts when needed
- Providing data-driven insights

Always cite your sources and explain your reasoning. Compare odds across multiple sportsbooks when available.`;

export type AgentMessage = SDKMessage;

interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
}

export interface StreamAgentOptions {
	prompt: string;
	workspacePath: string;
	conversationHistory?: ConversationMessage[];
	abortController?: AbortController;
}

export async function* streamAgentResponse({
	prompt,
	workspacePath,
	conversationHistory,
	abortController,
}: StreamAgentOptions): AsyncGenerator<SDKMessage> {
	console.log("[Agent] streamAgentResponse called");
	let fullPrompt = prompt;

	if (conversationHistory && conversationHistory.length > 0) {
		const historyText = conversationHistory
			.map(
				(msg) =>
					`${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
			)
			.join("\n\n");
		fullPrompt = `Previous conversation:\n${historyText}\n\nUser: ${prompt}`;
	}

	const cliPath = getClaudeCodeCliPath();
	console.log("[Agent] Creating query with CLI path:", cliPath);

	try {
		const generator = query({
			prompt: fullPrompt,
			options: {
				cwd: workspacePath,
				model: "claude-opus-4-5-20251101",
				pathToClaudeCodeExecutable: cliPath,
				allowedTools: [
					"Read",
					"Write",
					"Edit",
					"Glob",
					"Grep",
					"Bash",
					"WebSearch",
					"WebFetch",
				],
				permissionMode: "acceptEdits",
				systemPrompt: {
					type: "preset",
					preset: "claude_code",
					append: SYSTEM_PROMPT_APPEND,
				},
				abortController: abortController ?? new AbortController(),
				includePartialMessages: true,
				maxThinkingTokens: 10000,
			},
		});

		yield* generator;
	} catch (error) {
		console.error("[Agent] Query error:", error);
		throw error;
	}
}

interface TextBlock {
	type: "text";
	text: string;
}

interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	signature: string;
}

interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: unknown;
}

type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | { type: string };

function getAssistantContent(message: SDKMessage): ContentBlock[] | null {
	if (message.type !== "assistant") {
		return null;
	}
	return message.message.content as ContentBlock[];
}

export function extractTextFromMessage(message: SDKMessage): string | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	return content
		.filter((block): block is TextBlock => block.type === "text")
		.map((block) => block.text)
		.join("");
}

export function extractToolUseFromMessage(
	message: SDKMessage,
): Array<{ id: string; name: string; input: unknown }> | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	return content
		.filter((block): block is ToolUseBlock => block.type === "tool_use")
		.map(({ id, name, input }) => ({ id, name, input }));
}

export function extractThinkingFromMessage(message: SDKMessage): string | null {
	const content = getAssistantContent(message);
	if (!content) return null;

	const thinkingTexts = content
		.filter((block): block is ThinkingBlock => block.type === "thinking")
		.map((block) => block.thinking);

	return thinkingTexts.length > 0 ? thinkingTexts.join("\n\n") : null;
}
