import { createStore } from "zustand/vanilla";
import { createLogger } from "@/lib/logger";
import { createDeduplicator, parseSSEStream } from "@/lib/sse";
import type {
	Chat,
	ChatInitEvent,
	ContentSegment,
	DeltaEvent,
	DoneEvent,
	ErrorEvent,
	Message,
	ResultEvent,
	StatusEvent,
	StreamingMessage,
	ThinkingEvent,
	ToolUseEvent,
} from "@/lib/types";
import type { QueueStore } from "./queue-store";

const log = createLogger("ChatStore");

function isNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message.toLowerCase();
	return (
		error.name === "TypeError" ||
		msg.includes("failed to fetch") ||
		msg.includes("load failed") ||
		msg.includes("network") ||
		msg.includes("the operation couldn't be completed")
	);
}

interface ChatState {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
	streamingSegments: ContentSegment[];
	isLoading: boolean;
	statusMessage: string | null;
	currentChat: Chat | null;
	sessionId: string | null;
	error: string | null;
	abortController: AbortController | null;
	stopReason: { stopReason: string; subtype: string } | null;
	disconnectedChatId: string | null;
	loadedChatId: string | undefined;
	isCreatingChat: boolean;
	isRecovering: boolean;
	lastEventAt: number;
}

interface ChatActions {
	handleEvent(type: string, data: unknown): void;
	publishSegments(): void;
	markToolsComplete(): void;
	finalizeStreamingMessage(): void;
	sendMessage(content: string): Promise<void>;
	stopGeneration(): void;
	startNewChat(): void;
	clearError(): void;
	setError(error: string | null): void;
}

export type ChatStore = ChatState & ChatActions;

export interface ChatStoreCallbacks {
	onChatCreated?: (chatId: string) => void;
	onStreamComplete?: (chatId: string) => void;
	getQueueStore: () => QueueStore;
}

export function createChatStore(callbacks: ChatStoreCallbacks) {
	return createStore<ChatStore>()((set, get) => ({
		messages: [],
		streamingMessage: null,
		streamingSegments: [],
		isLoading: false,
		statusMessage: null,
		currentChat: null,
		sessionId: null,
		error: null,
		abortController: null,
		stopReason: null,
		disconnectedChatId: null,
		loadedChatId: undefined,
		isCreatingChat: false,
		isRecovering: false,
		lastEventAt: 0,

		publishSegments() {
			set({
				streamingMessage: {
					segments: [...get().streamingSegments],
					isStreaming: true,
				},
			});
		},

		markToolsComplete() {
			set({
				streamingSegments: get().streamingSegments.map((segment) =>
					segment.type === "tool_use"
						? {
								...segment,
								tool: { ...segment.tool, status: "complete" as const },
							}
						: segment,
				),
			});
			get().publishSegments();
		},

		handleEvent(type: string, data: unknown) {
			const state = get();
			set({ lastEventAt: Date.now() });

			switch (type) {
				case "init": {
					const initData = data as ChatInitEvent;
					set({
						sessionId: initData.sessionId,
						currentChat: {
							id: initData.chatId,
							sessionId: initData.sessionId,
							title: state.currentChat?.title || "",
							createdAt:
								state.currentChat?.createdAt || new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							messages: state.currentChat?.messages || [],
						},
					});
					if (!state.loadedChatId && !state.isCreatingChat) {
						set({ isCreatingChat: true });
						callbacks.onChatCreated?.(initData.chatId);
					}
					break;
				}
				case "status": {
					const statusData = data as StatusEvent;
					set({ statusMessage: statusData.message });
					break;
				}
				case "delta": {
					const deltaData = data as DeltaEvent;
					const segments = state.streamingSegments;
					const lastSegment = segments[segments.length - 1];

					const updatedSegments =
						lastSegment?.type === "text"
							? [
									...segments.slice(0, -1),
									{
										...lastSegment,
										text: lastSegment.text + deltaData.text,
									},
								]
							: [...segments, { type: "text" as const, text: deltaData.text }];

					set({ statusMessage: null, streamingSegments: updatedSegments });
					get().publishSegments();
					break;
				}
				case "thinking": {
					const thinkingData = data as ThinkingEvent;
					set({
						statusMessage: null,
						streamingSegments: [
							...state.streamingSegments,
							{
								type: "thinking" as const,
								thinking: thinkingData.thinking,
								isComplete: true,
							},
						],
					});
					get().publishSegments();
					break;
				}
				case "tool_use": {
					const toolData = data as ToolUseEvent;
					set({
						streamingSegments: [
							...state.streamingSegments,
							{
								type: "tool_use" as const,
								tool: {
									name: toolData.name,
									input: toolData.input,
									status: "running",
								},
							},
						],
					});
					get().publishSegments();
					break;
				}
				case "turn_complete": {
					state.markToolsComplete();
					break;
				}
				case "result": {
					state.markToolsComplete();
					const { stop_reason, subtype } = data as ResultEvent;
					const isAbnormalStop =
						stop_reason != null && stop_reason !== "end_turn";

					if (isAbnormalStop || subtype !== "success") {
						set({
							stopReason: {
								stopReason: isAbnormalStop ? stop_reason : subtype,
								subtype,
							},
						});
					}
					break;
				}
				case "done": {
					const doneData = data as DoneEvent;
					set({ statusMessage: null, sessionId: doneData.sessionId });
					break;
				}
				case "error": {
					const errorData = data as ErrorEvent;
					set({ statusMessage: null, error: errorData.message });
					break;
				}
			}
		},

		finalizeStreamingMessage() {
			const state = get();
			const segments = state.streamingSegments;
			const stopInfo = state.stopReason;
			set({
				streamingSegments: [],
				streamingMessage: null,
				stopReason: null,
			});

			if (segments.length === 0) return;

			if (stopInfo) {
				segments.push({
					type: "stop_notice",
					stopReason: stopInfo.stopReason,
					subtype: stopInfo.subtype,
				});
			}

			const content = segments
				.filter(
					(s): s is Extract<ContentSegment, { type: "text" }> =>
						s.type === "text",
				)
				.map((s) => s.text)
				.join("");

			const toolUses = segments
				.filter(
					(s): s is Extract<ContentSegment, { type: "tool_use" }> =>
						s.type === "tool_use",
				)
				.map((s) => s.tool);

			set({
				messages: [
					...get().messages,
					{
						id: `msg-${crypto.randomUUID()}`,
						chatId: state.currentChat?.id || "",
						role: "assistant",
						content,
						stopReason: stopInfo?.stopReason,
						toolInput: toolUses.length > 0 ? toolUses : undefined,
						segments: [...segments],
						createdAt: new Date().toISOString(),
					},
				],
			});
		},

		startNewChat() {
			set({
				currentChat: null,
				messages: [],
				sessionId: null,
				streamingMessage: null,
				isRecovering: false,
			});
			callbacks.getQueueStore().clear();
		},

		async sendMessage(content) {
			const state = get();
			if (!content.trim() || state.isLoading) return;

			log.info("Sending message", {
				chatId: state.currentChat?.id,
				length: content.length,
			});

			const userMessage: Message = {
				id: `temp-${crypto.randomUUID()}`,
				chatId: state.currentChat?.id || "",
				role: "user",
				content,
				createdAt: new Date().toISOString(),
			};

			const abortController = new AbortController();

			set({
				messages: [...state.messages, userMessage],
				isLoading: true,
				lastEventAt: Date.now(),
				streamingSegments: [],
				streamingMessage: { segments: [], isStreaming: true },
				abortController,
			});

			const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

			try {
				const currentState = get();
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: content,
						chatId: currentState.currentChat?.id,
						sessionId: currentState.sessionId,
						timezone: userTimezone,
					}),
					signal: abortController.signal,
				});

				if (!response.ok) {
					if (response.status === 401) {
						window.location.href = "/auth/signin";
						return;
					}
					throw new Error("Failed to send message");
				}

				const headerChatId = response.headers.get("X-Chat-Id");
				if (headerChatId && !currentState.currentChat?.id) {
					set({
						isCreatingChat: true,
						currentChat: {
							id: headerChatId,
							sessionId: "",
							title: "",
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							messages: [],
						},
					});
					callbacks.onChatCreated?.(headerChatId);
				}

				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error("No response body");
				}

				const dedup = createDeduplicator();
				for await (const event of parseSSEStream(reader)) {
					if (dedup.isDuplicate(event.id)) continue;
					get().handleEvent(event.type, event.data);

					if (
						event.type === "turn_complete" &&
						callbacks.getQueueStore().pendingMessages.length > 0
					) {
						get().abortController?.abort();
						break;
					}
				}
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}

				if (isNetworkError(error)) {
					const disconnectedId = get().currentChat?.id;
					if (disconnectedId) {
						set({
							disconnectedChatId: disconnectedId,
							isRecovering: true,
						});
						log.warn("Network error, recovering", { disconnectedId });
					}
					return;
				}

				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				log.error("Send failed", error);
				set({ error: errorMessage });
				callbacks.getQueueStore().clear();
			} finally {
				set({
					isLoading: false,
					statusMessage: null,
				});
				get().finalizeStreamingMessage();
				const chatId = get().currentChat?.id;
				if (chatId) {
					callbacks.onStreamComplete?.(chatId);
				}
			}
		},

		stopGeneration() {
			log.info("Stopping generation");
			const chatId = get().currentChat?.id;
			if (chatId) {
				fetch(`/api/chats/${chatId}/stop`, { method: "POST" }).catch(() => {
					// Intentional: fire-and-forget
				});
			}
			get().abortController?.abort();
			set({ isLoading: false, isRecovering: false });
			callbacks.getQueueStore().clear();
			get().finalizeStreamingMessage();
		},

		clearError() {
			set({ error: null });
		},

		setError(error) {
			set({ error });
		},
	}));
}
