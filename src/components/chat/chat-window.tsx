"use client";

import { Loader2, X } from "lucide-react";
import { useCallback } from "react";
import { useActiveChat } from "@/components/chat/chat-context";
import { useSessionContext } from "@/lib/auth/session-context";
import { capitalize, cn } from "@/lib/utils";
import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";

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

function RecoveryBanner({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-md bg-accent/10 border border-accent/30 p-3 text-sm text-accent",
				className,
			)}
		>
			<Loader2 className="h-4 w-4 animate-spin shrink-0" />
			<span>Fortuna is still working on your response...</span>
		</div>
	);
}

export function ChatWindow() {
	const { session, isPending } = useSessionContext();
	const {
		messages,
		streamingMessage,
		isLoading,
		isRecovering,
		statusMessage,
		messageQueue,
		error,
		sendMessage,
		stopGeneration,
		queueMessage,
		removeQueuedMessage,
		clearError,
	} = useActiveChat();

	const handleSend = useCallback(
		(message: string) => {
			clearError();
			sendMessage(message);
		},
		[sendMessage, clearError],
	);

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
						onDismiss={clearError}
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
			{isRecovering && !isLoading && <RecoveryBanner className="mx-4 mb-2" />}
			{error && !isRecovering && (
				<ErrorBanner
					message={error}
					onDismiss={clearError}
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
