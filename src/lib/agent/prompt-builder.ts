import type {
	ConversationMessage,
	ConversationToolResult,
	ConversationToolUse,
} from "@/lib/types";

function formatToolInput(input: unknown): string {
	if (input == null) return "";
	if (typeof input === "string") return input;
	try {
		return JSON.stringify(input);
	} catch {
		return String(input);
	}
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
			const inputStr = formatToolInput(tool.input);
			const label = inputStr ? `${tool.name}(${inputStr})` : tool.name;
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
		const attachmentNote = message.attachments?.length
			? ` [Attached: ${message.attachments.map((a) => a.filename).join(", ")}]`
			: "";
		return `User: ${message.content}${attachmentNote}`;
	}

	const thinkingPart = message.thinking
		? `[Your internal reasoning]: ${message.thinking}\n\n`
		: "";
	const toolsPart = message.tools?.length
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
