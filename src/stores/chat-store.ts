import { createStore } from "zustand/vanilla";
import { createLogger } from "@/lib/logger";
import { createDeduplicator, parseSSEStream } from "@/lib/sse";
import type {
	Attachment,
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
	ThinkingDeltaEvent,
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
	isFetchingChat: boolean;
	isRecovering: boolean;
	lastEventAt: number;
	sandboxStreamUrl: string | null;
	sandboxStreamToken: string | null;
}

interface ChatActions {
	handleEvent(type: string, data: unknown): void;
	publishSegments(): void;
	markToolsComplete(): void;
	finalizeStreamingMessage(): boolean;
	sendMessage(content: string, attachments?: Attachment[]): Promise<void>;
	stopGeneration(): void;
	startNewChat(): void;
	clearError(): void;
	setError(error: string | null): void;
}

export type ChatStore = ChatState & ChatActions;

export interface ChatStoreCallbacks {
	onChatCreated?: (chatId: string) => void;
	onStreamComplete?: (chatId: string, hasContent: boolean) => void;
	getQueueStore: () => QueueStore;
}

interface SandboxStreamInfo {
	chatId: string;
	sessionId: string;
	streamUrl: string;
	streamToken: string;
}

const CONNECTION_DEAD_MS = 45_000;

async function consumeSSEEvents(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	get: () => ChatStore,
	abortController: AbortController,
	queueStore: () => QueueStore,
): Promise<{ receivedDone: boolean }> {
	let receivedDone = false;
	const dedup = createDeduplicator();

	let deadTimer: ReturnType<typeof setTimeout> | undefined;
	const resetDeadTimer = () => {
		clearTimeout(deadTimer);
		deadTimer = setTimeout(() => {
			log.warn("No events for 45s, cancelling reader");
			reader.cancel().catch(() => null);
		}, CONNECTION_DEAD_MS);
	};
	resetDeadTimer();

	try {
		for await (const event of parseSSEStream(reader)) {
			resetDeadTimer();

			if (event.type === "__heartbeat__") {
				continue;
			}
			if (dedup.isDuplicate(event.id)) continue;
			get().handleEvent(event.type, event.data);

			if (event.type === "done" || event.type === "error") {
				receivedDone = true;
				reader.cancel().catch(() => null);
				break;
			}

			if (
				event.type === "turn_complete" &&
				queueStore().pendingMessages.length > 0
			) {
				receivedDone = true;
				abortController.abort();
				break;
			}
		}
	} finally {
		clearTimeout(deadTimer);
	}
	return { receivedDone };
}

async function connectToSandboxStream(
	info: SandboxStreamInfo,
	abortController: AbortController,
	currentChat: Chat | null,
	isNewChat: boolean,
	set: (partial: Partial<ChatState>) => void,
	get: () => ChatStore,
	callbacks: ChatStoreCallbacks,
): Promise<{ receivedDone: boolean }> {
	set({
		sandboxStreamUrl: info.streamUrl,
		sandboxStreamToken: info.streamToken,
		sessionId: info.sessionId,
		currentChat: buildChatObject(info.chatId, info.sessionId, currentChat),
	});

	if (isNewChat) {
		set({ isCreatingChat: true });
		callbacks.onChatCreated?.(info.chatId);
	}

	const sseResponse = await fetch(`${info.streamUrl}/stream`, {
		headers: { Authorization: `Bearer ${info.streamToken}` },
		signal: abortController.signal,
	});

	if (!sseResponse.ok) {
		throw new Error("Failed to connect to analysis engine");
	}

	const sseReader = sseResponse.body?.getReader();
	if (!sseReader) {
		throw new Error("No SSE response body");
	}

	return consumeSSEEvents(
		sseReader,
		get,
		abortController,
		callbacks.getQueueStore,
	);
}

function buildChatObject(
	chatId: string,
	sessionId: string,
	existing: Chat | null,
): Chat {
	return {
		id: chatId,
		sessionId,
		title: existing?.title || "",
		createdAt: existing?.createdAt || new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		messages: existing?.messages || [],
	};
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
		isFetchingChat: false,
		isRecovering: false,
		lastEventAt: 0,
		sandboxStreamUrl: null,
		sandboxStreamToken: null,

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
						currentChat: buildChatObject(
							initData.chatId,
							initData.sessionId,
							state.currentChat,
						),
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
					const segments = [...state.streamingSegments];
					const lastSeg = segments[segments.length - 1];
					if (lastSeg?.type === "thinking" && lastSeg.isComplete === false) {
						segments[segments.length - 1] = {
							...lastSeg,
							thinking: thinkingData.thinking,
							isComplete: true,
						};
					} else {
						segments.push({
							type: "thinking",
							thinking: thinkingData.thinking,
							isComplete: true,
						});
					}
					set({ streamingSegments: segments });
					get().publishSegments();
					break;
				}
				case "thinking_delta": {
					set({ statusMessage: null });
					const deltaData = data as ThinkingDeltaEvent;
					const segments = [...state.streamingSegments];
					const lastSeg = segments[segments.length - 1];
					if (lastSeg?.type === "thinking" && lastSeg.isComplete === false) {
						segments[segments.length - 1] = {
							...lastSeg,
							thinking: lastSeg.thinking + deltaData.thinking,
						};
					} else {
						segments.push({
							type: "thinking",
							thinking: deltaData.thinking,
							isComplete: false,
						});
					}
					set({ streamingSegments: segments });
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

			if (segments.length === 0) return false;

			const finalizedSegments = segments.map((seg) => {
				if (seg.type === "thinking" && seg.isComplete === false)
					return { ...seg, isComplete: true as const };
				if (seg.type === "tool_use" && seg.tool.status === "running")
					return {
						...seg,
						tool: { ...seg.tool, status: "interrupted" as const },
					};
				return seg;
			});

			if (stopInfo) {
				finalizedSegments.push({
					type: "stop_notice",
					stopReason: stopInfo.stopReason,
					subtype: stopInfo.subtype,
				});
			}

			const content = finalizedSegments
				.filter(
					(s): s is Extract<ContentSegment, { type: "text" }> =>
						s.type === "text",
				)
				.map((s) => s.text)
				.join("");

			const toolUses = finalizedSegments
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
						segments: finalizedSegments,
						createdAt: new Date().toISOString(),
					},
				],
			});
			return true;
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

		async sendMessage(content, attachments) {
			const state = get();
			if ((!content.trim() && !attachments?.length) || state.isLoading) return;

			log.info("Sending message", {
				chatId: state.currentChat?.id,
				length: content.length,
				attachments: attachments?.length,
			});

			const userMessage: Message = {
				id: `temp-${crypto.randomUUID()}`,
				chatId: state.currentChat?.id || "",
				role: "user",
				content,
				attachments,
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
			let receivedDone = false;
			let aborted = false;

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
						attachments: attachments?.map(
							({ key, filename, mimeType, size }) => ({
								key,
								filename,
								mimeType,
								size,
							}),
						),
					}),
					signal: abortController.signal,
				});

				if (!response.ok) {
					if (response.status === 401) {
						window.location.href = "/auth/signin";
						return;
					}
					if (response.status === 409) {
						// Server is still processing the previous turn. Re-enqueue
						// the message so the queue processor retries after a delay.
						// Remove the optimistic user message we already added so it
						// doesn't appear twice when the retry succeeds.
						log.warn("409 conflict — re-enqueuing message", {
							chatId: get().currentChat?.id,
						});
						set({
							messages: get().messages.filter((m) => m.id !== userMessage.id),
							streamingMessage: null,
							streamingSegments: [],
						});
						callbacks.getQueueStore().enqueue(content, attachments);
						receivedDone = true; // Prevent finally from entering recovery
						return;
					}
					throw new Error("Failed to send message");
				}

				const contentType = response.headers.get("content-type") || "";
				const streamMode = response.headers.get("X-Stream-Mode");
				const isNewChat =
					!currentState.loadedChatId && !currentState.isCreatingChat;

				if (streamMode === "setup") {
					const setupReader = response.body?.getReader();
					if (!setupReader) {
						throw new Error("No setup stream body");
					}

					let streamInfo: SandboxStreamInfo | null = null;
					let chatAlreadyRouted = false;

					for await (const event of parseSSEStream(setupReader)) {
						if (event.type === "chat_created") {
							const { chatId: newChatId, sessionId: newSessionId } =
								event.data as ChatInitEvent;
							set({
								sessionId: newSessionId,
								currentChat: buildChatObject(
									newChatId,
									newSessionId,
									currentState.currentChat,
								),
								...(isNewChat && { isCreatingChat: true }),
							});
							if (isNewChat) {
								chatAlreadyRouted = true;
								callbacks.onChatCreated?.(newChatId);
							}
						} else if (event.type === "status") {
							get().handleEvent("status", event.data);
						} else if (event.type === "ready") {
							streamInfo = event.data as SandboxStreamInfo;
						} else if (event.type === "error") {
							log.error("Setup stream error", {
								chatId: get().currentChat?.id,
								error: (event.data as { message?: string })?.message,
							});
							get().handleEvent("error", event.data);
							receivedDone = true;
							return;
						}
					}

					if (!streamInfo) {
						throw new Error("Setup stream ended without ready event");
					}

					({ receivedDone } = await connectToSandboxStream(
						streamInfo,
						abortController,
						currentState.currentChat,
						isNewChat && !chatAlreadyRouted,
						set,
						get,
						callbacks,
					));
				} else if (contentType.includes("application/json")) {
					const streamInfo = (await response.json()) as SandboxStreamInfo;

					({ receivedDone } = await connectToSandboxStream(
						streamInfo,
						abortController,
						currentState.currentChat,
						isNewChat,
						set,
						get,
						callbacks,
					));
				} else {
					const headerChatId = response.headers.get("X-Chat-Id");
					if (headerChatId && !currentState.currentChat?.id) {
						set({
							isCreatingChat: true,
							currentChat: buildChatObject(headerChatId, "", null),
						});
						callbacks.onChatCreated?.(headerChatId);
					}

					const reader = response.body?.getReader();
					if (!reader) {
						throw new Error("No response body");
					}

					({ receivedDone } = await consumeSSEEvents(
						reader,
						get,
						abortController,
						callbacks.getQueueStore,
					));
				}
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					aborted = true;
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
				if (aborted) {
					// The abort may have come from the visibility-change recovery
					// handler rather than the user clicking stop. In that case
					// stopGeneration() won't run, so clear isLoading here to
					// prevent the submit button from getting stuck.
					if (get().isRecovering) {
						log.info("Stream cleanup: aborted into recovery", {
							chatId: get().currentChat?.id,
						});
						set({ isLoading: false, statusMessage: null });
					}
				} else if (get().isRecovering) {
					log.info("Stream cleanup: already recovering", {
						chatId: get().currentChat?.id,
					});
					set({
						isLoading: false,
						statusMessage: null,
						streamingSegments: [],
						streamingMessage: null,
						stopReason: null,
					});
				} else if (receivedDone) {
					log.info("Stream cleanup: normal completion", {
						chatId: get().currentChat?.id,
					});
					set({ isLoading: false, statusMessage: null });
					const hasContent = get().finalizeStreamingMessage();
					const completedChatId = get().currentChat?.id;
					if (completedChatId) {
						callbacks.onStreamComplete?.(completedChatId, hasContent);
					}
				} else {
					log.warn("Stream cleanup: no done event, entering recovery", {
						chatId: get().currentChat?.id,
					});
					set({
						isLoading: false,
						statusMessage: null,
						streamingSegments: [],
						streamingMessage: null,
						stopReason: null,
						isRecovering: true,
						disconnectedChatId: get().currentChat?.id ?? null,
					});
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
			set({
				isLoading: false,
				isRecovering: false,
				sandboxStreamUrl: null,
				sandboxStreamToken: null,
				stopReason: { stopReason: "user_stopped", subtype: "user_stopped" },
			});
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
