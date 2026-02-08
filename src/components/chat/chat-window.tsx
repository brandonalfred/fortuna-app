"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@/hooks/use-chat";
import { useSessionContext } from "@/lib/auth/session-context";
import { capitalize, cn } from "@/lib/utils";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

interface ChatWindowProps {
	chatId?: string;
}

interface ErrorBannerProps {
	message: string;
	onDismiss: () => void;
	className?: string;
}

function ErrorBanner({ message, onDismiss, className }: ErrorBannerProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between rounded-md bg-error-subtle border border-error p-3 text-sm text-error",
				className,
			)}
		>
			<span>{message}</span>
			<button
				type="button"
				onClick={onDismiss}
				className="ml-2 shrink-0 text-error/60 hover:text-error"
				aria-label="Dismiss"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	);
}

export function ChatWindow({ chatId }: ChatWindowProps) {
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();
	const { session, isPending } = useSessionContext();
	// When a new chat is created mid-stream, we update the URL immediately via
	// history.replaceState (to avoid unmounting the component), then sync the
	// Next.js router once streaming completes.
	const pendingNavigationRef = useRef<string | null>(null);

	const {
		messages,
		streamingMessage,
		isLoading,
		statusMessage,
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
			pendingNavigationRef.current = newChatId;
		},
		onChatNotFound: () => {
			setError("Chat not found");
			router.replace("/new");
		},
	});

	useEffect(() => {
		if (isLoading || !pendingNavigationRef.current) return;
		const chatPath = `/chat/${pendingNavigationRef.current}`;
		pendingNavigationRef.current = null;
		router.replace(chatPath);
	}, [isLoading, router]);

	const handleSend = useCallback(
		(message: string) => {
			setError(null);
			sendMessage(message);
		},
		[sendMessage],
	);

	const dismissError = useCallback(() => setError(null), []);

	const isEmpty = messages.length === 0 && !streamingMessage;

	if (isEmpty) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-4">
				<h1 className="font-display text-4xl text-text-primary mb-3 text-center">
					Welcome to FortunaBets
					{!isPending && session?.user?.firstName && (
						<span className="animate-message-in">
							,<br />
							{capitalize(session.user.firstName)}
						</span>
					)}
				</h1>
				<p className="text-text-secondary text-center max-w-md mb-8">
					Ask about any game. Get AI-powered odds, matchups, and
					insights—instantly.
				</p>
				{error && (
					<ErrorBanner
						message={error}
						onDismiss={dismissError}
						className="mb-4 w-full max-w-2xl"
					/>
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
					statusMessage={statusMessage}
					messageQueue={messageQueue}
					onRemoveQueued={removeQueuedMessage}
				/>
			</div>
			{error && (
				<ErrorBanner
					message={error}
					onDismiss={dismissError}
					className="mx-4 mb-2"
				/>
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
