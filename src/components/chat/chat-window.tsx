"use client";

import { useCallback, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

export function ChatWindow() {
	const [error, setError] = useState<string | null>(null);

	const {
		messages,
		streamingMessage,
		isLoading,
		messageQueue,
		sendMessage,
		stopGeneration,
		queueMessage,
		removeQueuedMessage,
	} = useChat({
		onError: setError,
	});

	const handleSend = useCallback(
		(message: string) => {
			setError(null);
			sendMessage(message);
		},
		[sendMessage],
	);

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-hidden">
				<MessageList
					messages={messages}
					streamingMessage={streamingMessage}
					messageQueue={messageQueue}
					onRemoveQueued={removeQueuedMessage}
				/>
			</div>
			{error && (
				<div className="mx-4 mb-2 rounded-md bg-error-subtle border border-error p-3 text-sm text-error">
					{error}
				</div>
			)}
			<ChatInput
				onSend={handleSend}
				onStop={stopGeneration}
				onQueue={queueMessage}
				isLoading={isLoading}
			/>
		</div>
	);
}
