"use client";

import { useParams, useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	use,
	useCallback,
	useState,
} from "react";
import {
	type QueuedMessage,
	type StreamingMessage,
	useChat,
} from "@/hooks/use-chat";
import type { Message } from "@/lib/types";

export type { QueuedMessage, StreamingMessage } from "@/hooks/use-chat";

interface ChatContextValue {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
	isLoading: boolean;
	statusMessage: string | null;
	messageQueue: QueuedMessage[];
	error: string | null;
	sendMessage: (content: string) => void;
	stopGeneration: () => void;
	queueMessage: (content: string) => void;
	removeQueuedMessage: (id: string) => void;
	clearError: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
	const { id: chatId } = useParams<{ id?: string }>();
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	const clearError = useCallback(() => setError(null), []);

	const chat = useChat({
		chatId,
		onError: setError,
		onChatCreated: (newChatId) => {
			router.replace(`/chat/${newChatId}`);
		},
		onChatNotFound: () => {
			setError("Chat not found");
			router.replace("/new");
		},
	});

	const value: ChatContextValue = {
		messages: chat.messages,
		streamingMessage: chat.streamingMessage,
		isLoading: chat.isLoading,
		statusMessage: chat.statusMessage,
		messageQueue: chat.messageQueue,
		sendMessage: chat.sendMessage,
		stopGeneration: chat.stopGeneration,
		queueMessage: chat.queueMessage,
		removeQueuedMessage: chat.removeQueuedMessage,
		error,
		clearError,
	};

	return <ChatContext value={value}>{children}</ChatContext>;
}

export function useActiveChat() {
	const context = use(ChatContext);
	if (!context) {
		throw new Error("useActiveChat must be used within ChatProvider");
	}
	return context;
}
