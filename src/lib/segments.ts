import type { ContentSegment, Message, ToolUse } from "@/lib/types";

export function hydrateMessageSegments(message: Message): Message {
	if (message.segments || message.role !== "assistant") {
		return message;
	}

	const segments: ContentSegment[] = [];

	if (message.thinking) {
		segments.push({
			type: "thinking",
			thinking: message.thinking,
			isComplete: true,
		});
	}

	if (Array.isArray(message.toolInput)) {
		for (const tool of message.toolInput as ToolUse[]) {
			if (tool?.name) {
				segments.push({
					type: "tool_use",
					tool: { name: tool.name, input: tool.input, status: "complete" },
				});
			}
		}
	}

	if (message.content) {
		segments.push({ type: "text", text: message.content });
	}

	if (message.stopReason && message.stopReason !== "end_turn") {
		segments.push({
			type: "stop_notice",
			stopReason: message.stopReason,
		});
	}

	if (segments.length === 0) {
		return message;
	}

	return { ...message, segments };
}
