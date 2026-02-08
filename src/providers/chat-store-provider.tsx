"use client";

import { useParams, useRouter } from "next/navigation";
import { createContext, type ReactNode, use, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createLogger } from "@/lib/logger";
import { type ChatStore, createChatStore } from "@/stores/chat-store";
import { createQueueStore, type QueueStore } from "@/stores/queue-store";

const log = createLogger("ChatStoreProvider");

type ChatStoreApi = ReturnType<typeof createChatStore>;
type QueueStoreApi = ReturnType<typeof createQueueStore>;

const ChatStoreContext = createContext<ChatStoreApi | null>(null);
const QueueStoreContext = createContext<QueueStoreApi | null>(null);

const RELOAD_THROTTLE_MS = 5000;
const STALE_STREAM_THRESHOLD_MS = 2000;
const STALE_STREAM_CHECK_DELAY_MS = 1000;
const STALE_STREAM_RELOAD_DELAY_MS = 1000;

export function ChatStoreProvider({ children }: { children: ReactNode }) {
	const { id: chatId } = useParams<{ id?: string }>();
	const router = useRouter();

	const [queueStore] = useState(() => createQueueStore());
	const [chatStore] = useState(() =>
		createChatStore({
			onChatCreated: (newChatId) => {
				router.replace(`/chat/${newChatId}`);
			},
			onChatNotFound: () => {
				chatStore.getState().setError("Chat not found");
				router.replace("/new");
			},
			getQueueStore: () => queueStore.getState(),
		}),
	);

	useEffect(() => {
		queueStore.persist.rehydrate();
		log.debug("Queue store hydrated");
	}, [queueStore]);

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
			state.fetchChat(chatId).then((success) => {
				if (!success) {
					chatStore.setState({ loadedChatId: undefined });
					chatStore.getState().setError("Chat not found");
					router.replace("/new");
				}
			});
		} else {
			chatStore.setState({ loadedChatId: undefined });
			state.startNewChat();
		}
	}, [chatId, chatStore, router]);

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
			if (chatState.isLoading) return;

			const next = queueStore.getState().dequeue();
			if (!next) return;

			dequeueing = true;
			try {
				await chatStore.getState().sendMessage(next.content);
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
		let hiddenAt: number | null = null;

		const tryReloadDisconnected = () => {
			const state = chatStore.getState();
			const disconnectedId = state.disconnectedChatId;
			if (!disconnectedId) return;
			if (Date.now() - state.lastReloadAttempt < RELOAD_THROTTLE_MS) return;
			chatStore.setState({ lastReloadAttempt: Date.now() });
			state.reloadChat(disconnectedId);
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				return;
			}

			const hiddenDuration = hiddenAt ? Date.now() - hiddenAt : 0;
			hiddenAt = null;

			const state = chatStore.getState();

			if (state.disconnectedChatId) {
				tryReloadDisconnected();
				return;
			}

			if (state.isLoading && hiddenDuration > STALE_STREAM_THRESHOLD_MS) {
				const id = state.currentChat?.id;
				if (id) {
					setTimeout(() => {
						const current = chatStore.getState();
						if (!current.isLoading) return;
						current.abortController?.abort();
						setTimeout(
							() => chatStore.getState().reloadChat(id),
							STALE_STREAM_RELOAD_DELAY_MS,
						);
					}, STALE_STREAM_CHECK_DELAY_MS);
				}
				return;
			}

			if (!state.isLoading && state.currentChat?.id) {
				state.reloadChat(state.currentChat.id);
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", tryReloadDisconnected);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", tryReloadDisconnected);
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
