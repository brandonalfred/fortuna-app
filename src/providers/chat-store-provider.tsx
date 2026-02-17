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
	const skipNextMessageReplaceRef = useRef(false);

	const [queueStore] = useState(() => createQueueStore());
	const [chatStore] = useState(() =>
		createChatStore({
			onChatCreated: (newChatId) => {
				router.replace(`/chat/${newChatId}`);
			},
			onStreamComplete: (completedChatId) => {
				skipNextMessageReplaceRef.current = true;
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

	const { data: chatData, isError } = useChatQuery(chatId, isStreaming);

	useEffect(() => {
		queueStore.persist.rehydrate();
		log.debug("Queue store hydrated");
	}, [queueStore]);

	useEffect(() => {
		if (!chatData) return;
		const state = chatStore.getState();
		if (state.isLoading || state.streamingMessage || state.isRecovering) return;

		const wasDisconnected = !!state.disconnectedChatId;
		const skipMessages = skipNextMessageReplaceRef.current && !wasDisconnected;
		skipNextMessageReplaceRef.current = false;

		chatStore.setState({
			currentChat: chatData,
			messages: skipMessages ? state.messages : chatData.messages || [],
			sessionId: chatData.sessionId,
			disconnectedChatId: null,
			error: wasDisconnected ? null : state.error,
		});
		queueStore.getState().clear();
	}, [chatData, chatStore, queueStore]);

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
			if (prevState.isLoading && !state.isLoading) {
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

		const chatState = chatStore.getState();
		if (
			!chatState.isLoading &&
			queueStore.getState().pendingMessages.length > 0
		) {
			processQueue();
		}

		return () => {
			unsubChat();
			unsubQueue();
		};
	}, [chatStore, queueStore]);

	useEffect(() => {
		const STALE_STREAM_MS = 5_000;
		const GRACE_PERIOD_MS = 3_000;
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
		let recoveryStartedAt = 0;

		const POLL_INTERVAL_MS = 3_000;
		const RECOVERY_TIMEOUT_MS = 2 * 60 * 1_000;
		const STALE_POLL_LIMIT = 20;

		function stopPolling(): void {
			if (interval) clearInterval(interval);
			interval = null;
		}

		const unsub = chatStore.subscribe((state, prev) => {
			if (state.isRecovering && !prev.isRecovering) {
				const targetChatId = state.disconnectedChatId || state.currentChat?.id;
				if (!targetChatId) return;
				const chatId: string = targetChatId;

				recoveryStartedAt = Date.now();
				let lastSeenSequenceNum = -1;
				let stalePollCount = 0;
				log.info("Recovery polling started", { chatId });

				function finishRecovery(
					data: Chat & { messages: Message[] },
					messages: Message[],
				): void {
					chatStore.setState({
						messages,
						currentChat: data,
						isRecovering: false,
						disconnectedChatId: null,
						error: null,
						sessionId: data.sessionId,
					});
					invalidateChatRef.current(chatId);
					stopPolling();
				}

				async function poll() {
					if (Date.now() - recoveryStartedAt > RECOVERY_TIMEOUT_MS) {
						log.warn("Recovery timed out", { chatId });
						chatStore.setState({
							isRecovering: false,
							disconnectedChatId: null,
							error: "The response took too long. Please try again.",
						});
						stopPolling();
						return;
					}

					try {
						const res = await fetch(`/api/chats/${chatId}`);
						if (res.status === 401) {
							window.location.href = "/auth/signin";
							return;
						}
						if (!res.ok) return;

						const data = (await res.json()) as Chat & {
							messages: Message[];
						};
						const messages = (data.messages || []).map(hydrateMessageSegments);

						if (!data.isProcessing) {
							log.info("Recovery complete", { chatId });
							finishRecovery(data, messages);
							return;
						}

						const currentSeqNum = data.lastSequenceNum ?? -1;
						if (currentSeqNum === lastSeenSequenceNum) {
							stalePollCount++;
							if (stalePollCount >= STALE_POLL_LIMIT) {
								log.warn("Recovery stale — no new events, forcing exit", {
									chatId,
									stalePollCount,
								});
								finishRecovery(data, messages);
								return;
							}
						} else {
							lastSeenSequenceNum = currentSeqNum;
							stalePollCount = 0;
						}
						chatStore.setState({ messages });
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
