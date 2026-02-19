"use client";

import { useParams, useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	use,
	useEffect,
	useRef,
	useState,
} from "react";
import { useStore } from "zustand";
import { useChatQuery, useInvalidateChat } from "@/hooks/use-chat-query";
import { createLogger } from "@/lib/logger";
import { hydrateMessageSegments } from "@/lib/segments";
import type { Chat, Message } from "@/lib/types";
import { type ChatStore, createChatStore } from "@/stores/chat-store";
import { createQueueStore, type QueueStore } from "@/stores/queue-store";

const log = createLogger("ChatStoreProvider");

const POLL_INTERVAL_MS = 3_000;
const RECOVERY_TIMEOUT_MS = 2 * 60 * 1_000;
const MAX_RECOVERY_MS = 10 * 60 * 1_000;
const STALE_POLL_LIMIT = 20;
const STALE_STREAM_MS = 5_000;
const GRACE_PERIOD_MS = 3_000;
type ChatWithMessages = Chat & { messages: Message[] };

function hydrateMessages(data: ChatWithMessages): Message[] {
	return (data.messages || []).map(hydrateMessageSegments);
}

type ChatStoreApi = ReturnType<typeof createChatStore>;
type QueueStoreApi = ReturnType<typeof createQueueStore>;

const ChatStoreContext = createContext<ChatStoreApi | null>(null);
const QueueStoreContext = createContext<QueueStoreApi | null>(null);

export function ChatStoreProvider({ children }: { children: ReactNode }) {
	const { id: chatId } = useParams<{ id?: string }>();
	const router = useRouter();
	const invalidateChat = useInvalidateChat();
	const invalidateChatRef = useRef(invalidateChat);
	invalidateChatRef.current = invalidateChat;
	const skipNextMessageReplaceRef = useRef<string | null>(null);

	const [queueStore] = useState(() => createQueueStore());
	const [chatStore] = useState(() =>
		createChatStore({
			onChatCreated: (newChatId) => {
				router.replace(`/chat/${newChatId}`);
			},
			onStreamComplete: (completedChatId, hasContent) => {
				if (hasContent) {
					skipNextMessageReplaceRef.current = completedChatId;
				}
				invalidateChatRef.current(completedChatId);
				fetch(`/api/chats/${completedChatId}/complete`, {
					method: "POST",
				}).catch(() => {
					/* fire-and-forget */
				});
			},
			getQueueStore: () => queueStore.getState(),
		}),
	);

	const isStreaming = useStore(chatStore, (s) => s.isLoading);

	const {
		data: chatData,
		isPending,
		isError,
	} = useChatQuery(chatId, isStreaming);

	useEffect(() => {
		chatStore.setState({
			isFetchingChat: isPending && !!chatId && !isStreaming,
		});
	}, [isPending, chatId, chatStore, isStreaming]);

	useEffect(() => {
		queueStore.persist.rehydrate();
		log.debug("Queue store hydrated");
	}, [queueStore]);

	useEffect(() => {
		if (!chatData) return;
		if (chatData.isProcessing) return;
		const state = chatStore.getState();
		if (state.isLoading || state.streamingMessage) return;

		if (state.isRecovering) return;

		const wasDisconnected = !!state.disconnectedChatId;
		const shouldSkip =
			!wasDisconnected && skipNextMessageReplaceRef.current === chatData.id;

		if (shouldSkip) {
			skipNextMessageReplaceRef.current = null;
		}

		chatStore.setState({
			currentChat: chatData,
			messages: shouldSkip ? state.messages : chatData.messages || [],
			sessionId: chatData.sessionId,
			disconnectedChatId: null,
			isFetchingChat: false,
			error: wasDisconnected ? null : state.error,
		});
		queueStore.getState().clear();
	}, [chatData, chatStore, queueStore]);

	useEffect(() => {
		if (!chatData?.isProcessing) return;
		const state = chatStore.getState();
		if (state.isLoading || state.isRecovering) return;

		log.info("Chat still processing on load, entering recovery", {
			chatId: chatData.id,
		});
		chatStore.setState({
			currentChat: chatData,
			messages: chatData.messages || [],
			sessionId: chatData.sessionId,
			isFetchingChat: false,
			isRecovering: true,
			disconnectedChatId: chatData.id,
		});
	}, [chatData, chatStore]);

	useEffect(() => {
		if (isError && chatId) {
			chatStore.setState({
				loadedChatId: undefined,
				error: "Chat not found",
			});
			router.replace("/new");
		}
	}, [isError, chatId, chatStore, router]);

	useEffect(() => {
		skipNextMessageReplaceRef.current = null;
		const state = chatStore.getState();

		if (state.isCreatingChat) {
			chatStore.setState({
				isCreatingChat: false,
				loadedChatId: chatId,
			});
			return;
		}

		state.abortController?.abort();

		if (chatId) {
			if (state.loadedChatId === chatId) return;
			chatStore.setState({ loadedChatId: chatId });
		} else {
			chatStore.setState({ loadedChatId: undefined });
			state.startNewChat();
		}
	}, [chatId, chatStore]);

	useEffect(() => {
		let dequeueing = false;

		const unsubChat = chatStore.subscribe((state, prevState) => {
			if (
				(prevState.isLoading && !state.isLoading) ||
				(prevState.isRecovering && !state.isRecovering)
			) {
				processQueue();
			}
		});

		const unsubQueue = queueStore.subscribe(() => {
			const chatState = chatStore.getState();
			if (!chatState.isLoading) {
				processQueue();
			}
		});

		async function processQueue() {
			if (dequeueing) return;
			const chatState = chatStore.getState();
			if (chatState.isLoading || chatState.isRecovering) return;

			const next = queueStore.getState().dequeue();
			if (!next) return;

			dequeueing = true;
			try {
				await chatStore.getState().sendMessage(next.content, next.attachments);
			} finally {
				dequeueing = false;
			}
		}

		processQueue();

		return () => {
			unsubChat();
			unsubQueue();
		};
	}, [chatStore, queueStore]);

	useEffect(() => {
		let hiddenAt: number | null = null;
		let graceTimeout: ReturnType<typeof setTimeout> | null = null;

		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				if (graceTimeout) {
					clearTimeout(graceTimeout);
					graceTimeout = null;
				}
				return;
			}

			if (hiddenAt === null) return;

			const elapsed = Date.now() - hiddenAt;
			hiddenAt = null;

			const state = chatStore.getState();
			if (!state.isLoading || elapsed <= STALE_STREAM_MS) return;

			const snapshotEventAt = state.lastEventAt;

			graceTimeout = setTimeout(() => {
				graceTimeout = null;
				const current = chatStore.getState();

				if (!current.isLoading) {
					log.info("Tab returned, stream already finished during grace period");
					return;
				}

				if (current.lastEventAt > snapshotEventAt) {
					log.info("Tab returned, stream resumed during grace period", {
						elapsed,
						eventsDelta: current.lastEventAt - snapshotEventAt,
					});
					return;
				}

				const disconnectedId = current.currentChat?.id;
				log.info(
					"Tab returned, stream stale after grace period — entering recovery",
					{
						elapsed,
						chatId: disconnectedId,
					},
				);
				if (disconnectedId) {
					chatStore.setState({
						disconnectedChatId: disconnectedId,
						isRecovering: true,
					});
				}
				current.abortController?.abort();
			}, GRACE_PERIOD_MS);
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			if (graceTimeout) clearTimeout(graceTimeout);
		};
	}, [chatStore]);

	useEffect(() => {
		let interval: ReturnType<typeof setInterval> | null = null;
		let progressDeadline = 0;
		let absoluteDeadline = 0;

		function stopPolling(): void {
			if (interval) clearInterval(interval);
			interval = null;
		}

		function finishRecovery(
			targetChatId: string,
			data: ChatWithMessages,
			messages: Message[],
		): void {
			const currentError = chatStore.getState().error;
			if (currentError) {
				log.warn("Recovery clearing existing error", {
					chatId: targetChatId,
					error: currentError,
				});
			}
			log.info("Recovery complete", {
				chatId: targetChatId,
				messageCount: messages.length,
			});
			chatStore.setState({
				messages,
				streamingMessage: null,
				streamingSegments: [],
				currentChat: data,
				isRecovering: false,
				disconnectedChatId: null,
				error: null,
				sessionId: data.sessionId,
			});
			invalidateChatRef.current(targetChatId);
			stopPolling();
		}

		function abortRecovery(error?: string): void {
			chatStore.setState({
				isRecovering: false,
				disconnectedChatId: null,
				error: error ?? null,
			});
			stopPolling();
		}

		function showStreamingProgress(messages: Message[]): void {
			const lastAssistantIdx = messages.findLastIndex(
				(m) => m.role === "assistant",
			);
			if (lastAssistantIdx === -1) {
				chatStore.setState({ messages });
				return;
			}
			const segments = messages[lastAssistantIdx].segments || [];
			chatStore.setState({
				messages: messages.slice(0, lastAssistantIdx),
				streamingMessage: { segments, isStreaming: true },
				streamingSegments: segments,
			});
		}

		const unsub = chatStore.subscribe((state, prev) => {
			if (state.isRecovering && !prev.isRecovering) {
				const maybeChatId = state.disconnectedChatId || state.currentChat?.id;
				if (!maybeChatId) return;
				const targetChatId: string = maybeChatId;

				const now = Date.now();
				absoluteDeadline = now + MAX_RECOVERY_MS;
				progressDeadline = now + RECOVERY_TIMEOUT_MS;
				let lastSeenSequenceNum = -1;
				let stalePollCount = 0;
				log.info("Recovery polling started", { chatId: targetChatId });

				async function poll() {
					const now = Date.now();

					if (now > absoluteDeadline) {
						log.warn("Recovery hit absolute ceiling", {
							chatId: targetChatId,
						});
						try {
							const res = await fetch(`/api/chats/${targetChatId}`);
							if (res.ok) {
								const data = (await res.json()) as ChatWithMessages;
								finishRecovery(targetChatId, data, hydrateMessages(data));
							} else {
								abortRecovery();
							}
						} catch {
							abortRecovery();
						}
						return;
					}

					if (now > progressDeadline) {
						log.warn("Recovery timed out — no progress", {
							chatId: targetChatId,
						});
						abortRecovery("The response took too long. Please try again.");
						return;
					}

					try {
						const res = await fetch(`/api/chats/${targetChatId}`);
						if (res.status === 401) {
							window.location.href = "/auth/signin";
							return;
						}
						if (!res.ok) return;

						const data = (await res.json()) as ChatWithMessages;
						const messages = hydrateMessages(data);

						if (!data.isProcessing) {
							finishRecovery(targetChatId, data, messages);
							return;
						}

						const currentSeqNum = data.lastSequenceNum ?? -1;
						if (currentSeqNum === lastSeenSequenceNum) {
							stalePollCount++;
							if (stalePollCount >= STALE_POLL_LIMIT) {
								log.warn("Recovery stale — no new events, forcing exit", {
									chatId: targetChatId,
									stalePollCount,
								});
								finishRecovery(targetChatId, data, messages);
								return;
							}
						} else {
							lastSeenSequenceNum = currentSeqNum;
							stalePollCount = 0;
							progressDeadline = Date.now() + RECOVERY_TIMEOUT_MS;
						}

						showStreamingProgress(messages);
					} catch {
						log.warn("Recovery poll failed");
					}
				}

				poll();
				interval = setInterval(poll, POLL_INTERVAL_MS);
			}

			if (!state.isRecovering && prev.isRecovering) {
				stopPolling();
			}
		});

		return () => {
			unsub();
			stopPolling();
		};
	}, [chatStore]);

	return (
		<ChatStoreContext value={chatStore}>
			<QueueStoreContext value={queueStore}>{children}</QueueStoreContext>
		</ChatStoreContext>
	);
}

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
	const store = use(ChatStoreContext);
	if (!store) {
		throw new Error("useChatStore must be used within ChatStoreProvider");
	}
	return useStore(store, selector);
}

export function useQueueStore<T>(selector: (state: QueueStore) => T): T {
	const store = use(QueueStoreContext);
	if (!store) {
		throw new Error("useQueueStore must be used within ChatStoreProvider");
	}
	return useStore(store, selector);
}
