import type { ChatEvent } from "@prisma/client";
import type {
	ContentSegment,
	ConversationMessage,
	Message,
	ToolUse,
} from "@/lib/types";

interface EventData {
	content?: string;
	thinking?: string;
	name?: string;
	input?: unknown;
	stopReason?: string;
	subtype?: string;
}

function appendWithSeparator(existing: string, addition: string): string {
	return existing ? `${existing}\n\n${addition}` : addition;
}

export function eventsToMessages(events: ChatEvent[]): Message[] {
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
			case "text": {
				lastAssistantCreatedAt ??= event.createdAt;
				const text = data.content ?? "";
				currentContent += text;
				currentSegments.push({ type: "text", text });
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

	function flushAssistant() {
		if (!assistantContent && !assistantThinking) return;
		history.push({
			role: "assistant",
			content: assistantContent,
			thinking: assistantThinking || null,
		});
		assistantContent = "";
		assistantThinking = "";
	}

	for (const event of events) {
		const data = event.data as EventData;

		switch (event.type) {
			case "user_message": {
				flushAssistant();
				history.push({
					role: "user",
					content: data.content ?? "",
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
			case "text": {
				assistantContent += data.content ?? "";
				break;
			}
			case "turn_complete":
			case "tool_use":
			case "result":
				break;
		}
	}

	flushAssistant();
	return history;
}
