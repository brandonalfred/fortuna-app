import type { ChatEvent } from "@prisma/client";
import type {
	Attachment,
	ContentSegment,
	ConversationMessage,
	ConversationToolResult,
	ConversationToolUse,
	Message,
	ToolUse,
} from "@/lib/types";

interface EventData {
	content?: string;
	thinking?: string;
	toolUseId?: string;
	name?: string;
	input?: unknown;
	isError?: boolean;
	stopReason?: string;
	subtype?: string;
	attachments?: Attachment[];
}

function appendWithSeparator(existing: string, addition: string): string {
	return existing ? `${existing}\n\n${addition}` : addition;
}

export function eventsToMessages(events: ChatEvent[]): Message[] {
	if (events.length === 0) return [];

	const messages: Message[] = [];
	let currentSegments: ContentSegment[] = [];
	let currentContent = "";
	let currentThinking = "";
	let currentTools: ToolUse[] = [];
	let currentStopReason: string | null = null;
	let lastAssistantCreatedAt: Date | null = null;

	function flushAssistantMessage(chatId: string) {
		if (
			currentSegments.length === 0 &&
			!currentContent &&
			currentTools.length === 0
		)
			return;

		messages.push({
			id: `evt-${crypto.randomUUID()}`,
			chatId,
			role: "assistant",
			content: currentContent,
			thinking: currentThinking || null,
			stopReason: currentStopReason,
			toolInput: currentTools.length > 0 ? currentTools : undefined,
			segments: [...currentSegments],
			createdAt: (lastAssistantCreatedAt ?? new Date()).toISOString(),
		});

		currentSegments = [];
		currentContent = "";
		currentThinking = "";
		currentTools = [];
		currentStopReason = null;
		lastAssistantCreatedAt = null;
	}

	for (const event of events) {
		const data = event.data as EventData;

		switch (event.type) {
			case "user_message": {
				flushAssistantMessage(event.chatId);
				messages.push({
					id: `evt-${event.id}`,
					chatId: event.chatId,
					role: "user",
					content: data.content ?? "",
					attachments: data.attachments,
					createdAt: event.createdAt.toISOString(),
				});
				break;
			}
			case "thinking": {
				lastAssistantCreatedAt ??= event.createdAt;
				const thinking = data.thinking ?? "";
				currentThinking = appendWithSeparator(currentThinking, thinking);
				currentSegments.push({
					type: "thinking",
					thinking,
					isComplete: true,
				});
				break;
			}
			case "text":
			case "delta": {
				lastAssistantCreatedAt ??= event.createdAt;
				const text =
					(data as EventData & { text?: string }).text ?? data.content ?? "";
				currentContent += text;
				const lastSegment = currentSegments.at(-1);
				if (lastSegment?.type === "text") {
					lastSegment.text += text;
				} else {
					currentSegments.push({ type: "text", text });
				}
				break;
			}
			case "tool_use": {
				lastAssistantCreatedAt ??= event.createdAt;
				const tool: ToolUse = {
					name: data.name ?? "",
					input: data.input,
					status: "complete",
				};
				currentTools.push(tool);
				currentSegments.push({ type: "tool_use", tool });
				break;
			}
			case "result": {
				if (data.stopReason && data.stopReason !== "end_turn") {
					currentStopReason = data.stopReason;
					currentSegments.push({
						type: "stop_notice",
						stopReason: data.stopReason,
						subtype: data.subtype,
					});
				}
				break;
			}
			case "tool_result":
			case "turn_complete":
				break;
		}
	}

	flushAssistantMessage(events[0]?.chatId ?? "");
	return messages;
}

export function rebuildConversationHistory(
	events: ChatEvent[],
): ConversationMessage[] {
	const history: ConversationMessage[] = [];
	let assistantContent = "";
	let assistantThinking = "";
	let assistantTools: ConversationToolUse[] = [];
	let assistantToolResults: ConversationToolResult[] = [];

	function flushAssistant() {
		if (!assistantContent && !assistantThinking && assistantTools.length === 0)
			return;
		history.push({
			role: "assistant",
			content: assistantContent,
			thinking: assistantThinking || null,
			tools: assistantTools.length > 0 ? [...assistantTools] : undefined,
			toolResults:
				assistantToolResults.length > 0 ? [...assistantToolResults] : undefined,
		});
		assistantContent = "";
		assistantThinking = "";
		assistantTools = [];
		assistantToolResults = [];
	}

	for (const event of events) {
		const data = event.data as EventData;

		switch (event.type) {
			case "user_message": {
				flushAssistant();
				history.push({
					role: "user",
					content: data.content ?? "",
					attachments: data.attachments,
				});
				break;
			}
			case "thinking": {
				assistantThinking = appendWithSeparator(
					assistantThinking,
					data.thinking ?? "",
				);
				break;
			}
			case "text":
			case "delta": {
				assistantContent +=
					(data as EventData & { text?: string }).text ?? data.content ?? "";
				break;
			}
			case "tool_use": {
				assistantTools.push({
					toolUseId: data.toolUseId,
					name: data.name ?? "",
					input: data.input,
				});
				break;
			}
			case "tool_result": {
				if (data.toolUseId && data.content) {
					assistantToolResults.push({
						toolUseId: data.toolUseId,
						content: data.content,
						isError: data.isError ?? false,
					});
				}
				break;
			}
			case "turn_complete":
			case "result":
				break;
		}
	}

	flushAssistant();
	return history;
}
