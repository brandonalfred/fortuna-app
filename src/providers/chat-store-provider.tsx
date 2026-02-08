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

	const [queueStore] = useState(() => createQueueStore());
	const [chatStore] = useState(() =>
		createChatStore({
			onChatCreated: (newChatId) => {
				router.replace(`/chat/${newChatId}`);
			},
			onStreamComplete: (completedChatId) => {
				invalidateChatRef.current(completedChatId);
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
		if (state.isLoading || state.streamingMessage) return;
		chatStore.setState({
			currentChat: chatData,
			messages: chatData.messages || [],
			sessionId: chatData.sessionId,
			error: null,
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
		return chatStore.subscribe((state, prev) => {
			if (state.disconnectedChatId && !prev.disconnectedChatId) {
				invalidateChatRef.current(state.disconnectedChatId);
			}
		});
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
