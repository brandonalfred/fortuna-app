"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useSession } from "@/lib/auth/client";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

interface ChatWindowProps {
	chatId?: string;
}

export function ChatWindow({ chatId }: ChatWindowProps) {
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const { data: session } = useSession();

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
		chatId,
		onError: setError,
		onChatCreated: (newChatId) => {
			window.history.replaceState(null, "", `/chat/${newChatId}`);
		},
		onChatNotFound: () => {
			setError("Chat not found");
			router.replace("/new");
		},
	});

	const handleSend = useCallback(
		(message: string) => {
			setError(null);
			sendMessage(message);
		},
		[sendMessage],
	);

	const isEmpty = messages.length === 0 && !streamingMessage;

	if (isEmpty) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-4">
				<h1 className="font-display text-4xl text-text-primary mb-3 text-center">
					Welcome to FortunaBets
					{session?.user?.firstName && (
						<>
							,<br />
							{session.user.firstName}
						</>
					)}
				</h1>
				<p className="text-text-secondary text-center max-w-md mb-8">
					Ask about any game. Get AI-powered odds, matchups, and
					insights—instantly.
				</p>
				{error && (
					<div className="mb-4 w-full max-w-2xl flex items-center justify-between rounded-md bg-error-subtle border border-error p-3 text-sm text-error">
						<span>{error}</span>
						<button
							type="button"
							onClick={() => setError(null)}
							className="ml-2 shrink-0 text-error/60 hover:text-error"
							aria-label="Dismiss"
						>
							&times;
						</button>
					</div>
				)}
				<ChatInput
					onSend={handleSend}
					onStop={stopGeneration}
					onQueue={queueMessage}
					isLoading={isLoading}
					variant="centered"
				/>
			</div>
		);
	}

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
				<div className="mx-4 mb-2 flex items-center justify-between rounded-md bg-error-subtle border border-error p-3 text-sm text-error">
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="ml-2 shrink-0 text-error/60 hover:text-error"
						aria-label="Dismiss"
					>
						&times;
					</button>
				</div>
			)}
			<ChatInput
				onSend={handleSend}
				onStop={stopGeneration}
				onQueue={queueMessage}
				isLoading={isLoading}
				placeholder="Reply..."
			/>
		</div>
	);
}
