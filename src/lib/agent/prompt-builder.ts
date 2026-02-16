import type {
	ConversationMessage,
	ConversationToolResult,
	ConversationToolUse,
} from "@/lib/types";

const MAX_TOOL_INPUT_SUMMARY_LENGTH = 50;

function summarizeToolInput(input: unknown): string {
	if (typeof input === "string") {
		return input.slice(0, MAX_TOOL_INPUT_SUMMARY_LENGTH);
	}
	if (input && typeof input === "object") {
		const obj = input as Record<string, unknown>;
		if (typeof obj.query === "string") return obj.query;
		if (typeof obj.name === "string") return obj.name;
	}
	return "";
}

function formatToolsWithResults(
	tools: ConversationToolUse[],
	toolResults?: ConversationToolResult[],
): string {
	const resultMap = new Map(
		toolResults?.map((result) => [result.toolUseId, result]) ?? [],
	);

	return tools
		.map((tool) => {
			const summary = summarizeToolInput(tool.input);
			const label = summary ? `${tool.name}("${summary}")` : tool.name;
			const result = tool.toolUseId ? resultMap.get(tool.toolUseId) : undefined;
			if (!result) return `[Tool: ${label}]`;

			const content = result.content;
			const prefix = result.isError ? " ERROR:" : "";
			return `[Tool: ${label}]${prefix} → ${content}`;
		})
		.join("\n");
}

function formatMessage(message: ConversationMessage): string {
	if (message.role === "user") {
		return `User: ${message.content}`;
	}

	const thinkingPart = message.thinking
		? `[Your internal reasoning]: ${message.thinking}\n\n`
		: "";
	const toolsPart =
		message.tools && message.tools.length > 0
			? `\n${formatToolsWithResults(message.tools, message.toolResults)}`
			: "";

	return `${thinkingPart}Assistant: ${message.content}${toolsPart}`;
}

export function buildFullPrompt(
	prompt: string,
	conversationHistory: ConversationMessage[],
): string {
	if (conversationHistory.length === 0) {
		return prompt;
	}

	const historyText = conversationHistory.map(formatMessage).join("\n\n");
	return `Previous conversation:\n${historyText}\n\nUser: ${prompt}`;
}
