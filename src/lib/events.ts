import type { ChatEvent } from "@prisma/client";
import {
	formatToolLabel,
	getToolSummary,
	isInternalTool,
	mapAgentStatus,
} from "@/lib/tool-labels";
import type {
	Attachment,
	ContentSegment,
	ConversationMessage,
	ConversationToolResult,
	ConversationToolUse,
	Message,
	SubAgent,
	SubAgentToolCall,
	SubAgentUsage,
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
	text?: string;
	taskId?: string;
	description?: string;
	status?: string;
	summary?: string;
	usage?: SubAgentUsage;
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
	const activeSubAgentStack: string[] = [];

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
		activeSubAgentStack.length = 0;
	}

	function findActiveSubAgent(): SubAgent | undefined {
		if (activeSubAgentStack.length === 0) return undefined;
		const topId = activeSubAgentStack[activeSubAgentStack.length - 1];
		for (const seg of currentSegments) {
			if (seg.type !== "subagent_group") continue;
			const agent = seg.agents.find((a) => a.taskId === topId);
			if (agent) return agent;
		}
		return undefined;
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
				const text = data.text ?? data.content ?? "";
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
				if (data.name && isInternalTool(data.name)) break;

				const activeAgent = findActiveSubAgent();
				if (activeAgent) {
					const toolCall: SubAgentToolCall = {
						name: data.name ?? "",
						summary: getToolSummary(data.name ?? "", data.input),
						status: "complete",
					};
					activeAgent.tools.push(toolCall);
					activeAgent.currentToolLabel = formatToolLabel(
						data.name ?? "",
						toolCall.summary,
					);
				} else {
					const tool: ToolUse = {
						name: data.name ?? "",
						input: data.input,
						status: "complete",
					};
					currentTools.push(tool);
					currentSegments.push({ type: "tool_use", tool });
				}
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
			case "subagent_start": {
				lastAssistantCreatedAt ??= event.createdAt;
				const taskId = data.taskId ?? "";
				const agent: SubAgent = {
					taskId,
					description: data.description ?? "",
					status: "running",
					tools: [],
				};
				const lastSeg = currentSegments.at(-1);
				if (lastSeg?.type === "subagent_group") {
					lastSeg.agents.push(agent);
				} else {
					currentSegments.push({
						type: "subagent_group",
						agents: [agent],
					});
				}
				activeSubAgentStack.push(taskId);
				break;
			}
			case "subagent_complete": {
				lastAssistantCreatedAt ??= event.createdAt;
				const completedTaskId = data.taskId ?? "";
				for (const seg of currentSegments) {
					if (seg.type !== "subagent_group") continue;
					const agent = seg.agents.find((a) => a.taskId === completedTaskId);
					if (agent) {
						agent.status = mapAgentStatus(data.status ?? "");
						agent.summary = data.summary;
						agent.usage = data.usage;
						agent.currentToolLabel = undefined;
						for (const t of agent.tools) {
							t.status = "complete";
						}
						break;
					}
				}
				const idx = activeSubAgentStack.indexOf(completedTaskId);
				if (idx !== -1) activeSubAgentStack.splice(idx, 1);
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
				assistantContent += data.text ?? data.content ?? "";
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
			case "subagent_start":
			case "subagent_complete":
				break;
		}
	}

	flushAssistant();
	return history;
}
