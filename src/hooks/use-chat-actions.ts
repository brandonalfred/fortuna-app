"use client";

import type {
	Attachment,
	Message,
	QueuedMessage,
	StreamingMessage,
	TodoItem,
} from "@/lib/types";
import { useChatStore, useQueueStore } from "@/providers/chat-store-provider";

interface ActiveChatValue {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
	isLoading: boolean;
	isFetchingChat: boolean;
	isRecovering: boolean;
	statusMessage: string | null;
	messageQueue: QueuedMessage[];
	todos: TodoItem[];
	error: string | null;
	sendMessage: (content: string, attachments?: Attachment[]) => void;
	stopGeneration: () => void;
	queueMessage: (content: string, attachments?: Attachment[]) => void;
	removeQueuedMessage: (id: string) => void;
	clearError: () => void;
}

export function useActiveChat(): ActiveChatValue {
	const messages = useChatStore((s) => s.messages);
	const streamingMessage = useChatStore((s) => s.streamingMessage);
	const isLoading = useChatStore((s) => s.isLoading);
	const isFetchingChat = useChatStore((s) => s.isFetchingChat);
	const isRecovering = useChatStore((s) => s.isRecovering);
	const statusMessage = useChatStore((s) => s.statusMessage);
	const todos = useChatStore((s) => s.todos);
	const error = useChatStore((s) => s.error);
	const sendMessage = useChatStore((s) => s.sendMessage);
	const stopGeneration = useChatStore((s) => s.stopGeneration);
	const clearError = useChatStore((s) => s.clearError);

	const messageQueue = useQueueStore((s) => s.pendingMessages);
	const queueMessage = useQueueStore((s) => s.enqueue);
	const removeQueuedMessage = useQueueStore((s) => s.remove);

	return {
		messages,
		streamingMessage,
		isLoading,
		isFetchingChat,
		isRecovering,
		statusMessage,
		messageQueue,
		todos,
		error,
		sendMessage,
		stopGeneration,
		queueMessage,
		removeQueuedMessage,
		clearError,
	};
}
