import { createStore } from "zustand/vanilla";
import { createLogger } from "@/lib/logger";
import { createDeduplicator, parseSSEStream } from "@/lib/sse";
import {
	formatToolLabel,
	getToolSummary,
	mapAgentStatus,
} from "@/lib/tool-labels";
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
	SubAgent,
	SubAgentCompleteEvent,
	SubAgentStartEvent,
	SubAgentToolCall,
	ThinkingDeltaEvent,
	ThinkingEvent,
	ToolUse,
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
	activeSubAgentStack: string[];
}

interface ChatActions {
	handleEvent(type: string, data: unknown): void;
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

function updateThinkingSegment(
	segments: ContentSegment[],
	thinking: string,
	mode: "snapshot" | "delta",
): ContentSegment[] {
	const result = [...segments];
	const last = result[result.length - 1];
	if (last?.type === "thinking" && last.isComplete === false) {
		result[result.length - 1] = {
			...last,
			thinking: mode === "delta" ? last.thinking + thinking : thinking,
			...(mode === "snapshot" && { isComplete: true as const }),
		};
	} else {
		result.push({
			type: "thinking",
			thinking,
			isComplete: mode === "snapshot",
		});
	}
	return result;
}

function withStreaming(segments: ContentSegment[]): {
	streamingSegments: ContentSegment[];
	streamingMessage: StreamingMessage;
} {
	return {
		streamingSegments: segments,
		streamingMessage: { segments, isStreaming: true },
	};
}

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

export function createChatStore(callbacks: ChatStoreCallbacks) {
	return createStore<ChatStore>()((set, get) => {
		function resetStreamingState(): Partial<ChatState> {
			return {
				isLoading: false,
				statusMessage: null,
				streamingSegments: [],
				streamingMessage: null,
				stopReason: null,
				activeSubAgentStack: [],
			};
		}

		async function connectToSandboxStream(
			info: SandboxStreamInfo,
			abortController: AbortController,
			currentChat: Chat | null,
			isNewChat: boolean,
		): Promise<{ receivedDone: boolean }> {
			set({
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

		return {
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
			activeSubAgentStack: [],

			markToolsComplete() {
				const updated = get().streamingSegments.map((segment) => {
					if (segment.type === "tool_use") {
						return {
							...segment,
							tool: {
								...segment.tool,
								status: "complete" as const,
							},
						};
					}
					if (segment.type === "subagent_group") {
						return {
							...segment,
							agents: segment.agents.map((a) => ({
								...a,
								currentToolLabel: undefined,
								tools: a.tools.map((t) => ({
									...t,
									status: "complete" as const,
								})),
							})),
						};
					}
					return segment;
				});
				set({ lastEventAt: Date.now(), ...withStreaming(updated) });
			},

			handleEvent(type: string, data: unknown) {
				const state = get();
				const now = Date.now();

				switch (type) {
					case "init": {
						const initData = data as ChatInitEvent;
						set({
							lastEventAt: now,
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
						set({
							lastEventAt: now,
							statusMessage: statusData.message,
						});
						break;
					}
					case "delta": {
						const deltaData = data as DeltaEvent;
						const segments = state.streamingSegments;
						const lastSegment = segments[segments.length - 1];

						const updated =
							lastSegment?.type === "text"
								? [
										...segments.slice(0, -1),
										{
											...lastSegment,
											text: lastSegment.text + deltaData.text,
										},
									]
								: [
										...segments,
										{
											type: "text" as const,
											text: deltaData.text,
										},
									];

						set({
							lastEventAt: now,
							statusMessage: null,
							...withStreaming(updated),
						});
						break;
					}
					case "thinking": {
						const thinkingData = data as ThinkingEvent;
						const updated = updateThinkingSegment(
							state.streamingSegments,
							thinkingData.thinking,
							"snapshot",
						);
						set({
							lastEventAt: now,
							statusMessage: null,
							...withStreaming(updated),
						});
						break;
					}
					case "thinking_delta": {
						const deltaData = data as ThinkingDeltaEvent;
						const updated = updateThinkingSegment(
							state.streamingSegments,
							deltaData.thinking,
							"delta",
						);
						set({
							lastEventAt: now,
							statusMessage: null,
							...withStreaming(updated),
						});
						break;
					}
					case "tool_use": {
						const toolData = data as ToolUseEvent;
						const stack = state.activeSubAgentStack;

						if (stack.length > 0) {
							const topId = stack[stack.length - 1];
							const updated = state.streamingSegments.map((seg) => {
								if (seg.type !== "subagent_group") return seg;
								const agents = seg.agents.map((a) => {
									if (a.taskId !== topId) return a;
									const toolCall: SubAgentToolCall = {
										name: toolData.name,
										summary: getToolSummary(toolData.name, toolData.input),
										status: "running",
									};
									const label = formatToolLabel(
										toolData.name,
										toolCall.summary,
									);
									return {
										...a,
										tools: [...a.tools, toolCall],
										currentToolLabel: label,
									};
								});
								return { ...seg, agents };
							});
							set({
								lastEventAt: now,
								statusMessage: null,
								...withStreaming(updated),
							});
						} else {
							const updated = [
								...state.streamingSegments,
								{
									type: "tool_use" as const,
									tool: {
										name: toolData.name,
										input: toolData.input,
										status: "running" as const,
									},
								},
							];
							set({
								lastEventAt: now,
								statusMessage: null,
								...withStreaming(updated),
							});
						}
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
						set({
							lastEventAt: now,
							statusMessage: null,
							sessionId: doneData.sessionId,
						});
						break;
					}
					case "error": {
						const errorData = data as ErrorEvent;
						set({
							lastEventAt: now,
							statusMessage: null,
							error: errorData.message,
						});
						break;
					}
					case "subagent_start": {
						const { taskId, description } = data as SubAgentStartEvent;
						const segments = [...state.streamingSegments];
						const lastSeg = segments[segments.length - 1];

						const newAgent: SubAgent = {
							taskId,
							description,
							status: "running",
							tools: [],
						};

						if (lastSeg?.type === "subagent_group") {
							segments[segments.length - 1] = {
								...lastSeg,
								agents: [...lastSeg.agents, newAgent],
							};
						} else {
							segments.push({
								type: "subagent_group",
								agents: [newAgent],
							});
						}
						set({
							lastEventAt: now,
							statusMessage: null,
							activeSubAgentStack: [...state.activeSubAgentStack, taskId],
							...withStreaming(segments),
						});
						break;
					}
					case "subagent_complete": {
						const {
							taskId,
							status: agentStatus,
							summary,
							usage,
						} = data as SubAgentCompleteEvent;

						const targetIdx = state.streamingSegments.findIndex(
							(s) =>
								s.type === "subagent_group" &&
								s.agents.some((a) => a.taskId === taskId),
						);
						if (targetIdx === -1) break;

						const seg = state.streamingSegments[targetIdx];
						if (seg.type !== "subagent_group") break;

						const updatedAgents = seg.agents.map((a) =>
							a.taskId === taskId
								? {
										...a,
										status: mapAgentStatus(agentStatus),
										summary,
										usage,
										currentToolLabel: undefined,
										tools: a.tools.map((t) => ({
											...t,
											status: "complete" as const,
										})),
									}
								: a,
						);
						const segments = [...state.streamingSegments];
						segments[targetIdx] = { ...seg, agents: updatedAgents };

						set({
							lastEventAt: now,
							activeSubAgentStack: state.activeSubAgentStack.filter(
								(id) => id !== taskId,
							),
							...withStreaming(segments),
						});
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
					activeSubAgentStack: [],
				});

				if (segments.length === 0) return false;

				const finalizedSegments = segments.map((seg) => {
					if (seg.type === "thinking" && seg.isComplete === false)
						return { ...seg, isComplete: true as const };
					if (seg.type === "tool_use" && seg.tool.status === "running")
						return {
							...seg,
							tool: {
								...seg.tool,
								status: "interrupted" as const,
							},
						};
					if (seg.type === "subagent_group") {
						return {
							...seg,
							agents: seg.agents.map((a) =>
								a.status === "running"
									? { ...a, status: "stopped" as const }
									: a,
							),
						};
					}
					return seg;
				});

				if (stopInfo) {
					finalizedSegments.push({
						type: "stop_notice",
						stopReason: stopInfo.stopReason,
						subtype: stopInfo.subtype,
					});
				}

				let content = "";
				const toolUses: ToolUse[] = [];
				for (const seg of finalizedSegments) {
					if (seg.type === "text") content += seg.text;
					else if (seg.type === "tool_use") toolUses.push(seg.tool);
				}

				set({
					messages: [
						...state.messages,
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
					activeSubAgentStack: [],
					isRecovering: false,
				});
				callbacks.getQueueStore().clear();
			},

			async sendMessage(content, attachments) {
				const state = get();
				if ((!content.trim() && !attachments?.length) || state.isLoading)
					return;

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
							log.warn("409 conflict — re-enqueuing message", {
								chatId: get().currentChat?.id,
							});
							set({
								messages: get().messages.filter((m) => m.id !== userMessage.id),
								streamingMessage: null,
								streamingSegments: [],
							});
							callbacks.getQueueStore().enqueue(content, attachments);
							receivedDone = true;
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
									...(isNewChat && {
										isCreatingChat: true,
									}),
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
									error: (
										event.data as {
											message?: string;
										}
									)?.message,
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
						));
					} else if (contentType.includes("application/json")) {
						const streamInfo = (await response.json()) as SandboxStreamInfo;

						({ receivedDone } = await connectToSandboxStream(
							streamInfo,
							abortController,
							currentState.currentChat,
							isNewChat,
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
							log.warn("Network error, recovering", {
								disconnectedId,
							});
						}
						return;
					}

					const errorMessage =
						error instanceof Error ? error.message : "Unknown error";
					log.error("Send failed", error);
					set({ error: errorMessage });
					callbacks.getQueueStore().clear();
				} finally {
					if (aborted && get().isRecovering) {
						log.info("Stream cleanup: aborted into recovery", {
							chatId: get().currentChat?.id,
						});
						set({ isLoading: false, statusMessage: null });
					} else if (aborted) {
						// stopGeneration() already handled cleanup
					} else if (get().isRecovering) {
						log.info("Stream cleanup: already recovering", {
							chatId: get().currentChat?.id,
						});
						set(resetStreamingState());
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
							...resetStreamingState(),
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
					fetch(`/api/chats/${chatId}/stop`, {
						method: "POST",
					}).catch(() => null);
				}
				get().abortController?.abort();
				set({
					isLoading: false,
					isRecovering: false,
					stopReason: {
						stopReason: "user_stopped",
						subtype: "user_stopped",
					},
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
		};
	});
}
