"use client";

import { useCallback, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

export function ChatWindow() {
	const [error, setError] = useState<string | null>(null);

	const { messages, streamingMessage, isLoading, sendMessage, stopGeneration } =
		useChat({
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
				<MessageList messages={messages} streamingMessage={streamingMessage} />
			</div>
			{error && (
				<div className="mx-4 mb-2 rounded-md bg-error-subtle border border-error p-3 text-sm text-error">
					{error}
				</div>
			)}
			<ChatInput
				onSend={handleSend}
				onStop={stopGeneration}
				isLoading={isLoading}
			/>
		</div>
	);
}
