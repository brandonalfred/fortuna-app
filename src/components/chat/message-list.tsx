"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueuedMessage, StreamingMessage } from "@/hooks/use-chat";
import type { Message } from "@/lib/types";
import {
	MessageItem,
	QueuedMessageItem,
	StreamingMessageItem,
} from "./message-item";

interface MessageListProps {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
	messageQueue: QueuedMessage[];
	onRemoveQueued: (id: string) => void;
}

export function MessageList({
	messages,
	streamingMessage,
	messageQueue,
	onRemoveQueued,
}: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const lastMessageRef = useRef<HTMLDivElement>(null);
	const [isNearBottom, setIsNearBottom] = useState(true);
	const prevMessagesLengthRef = useRef(0);

	const userScrollingRef = useRef(false);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleScroll = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		userScrollingRef.current = true;

		const threshold = 100;
		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		setIsNearBottom(distanceFromBottom < threshold);

		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}
		scrollTimeoutRef.current = setTimeout(() => {
			userScrollingRef.current = false;
		}, 150);
	}, []);

	// Scroll to last message when a new message is added (user sends)
	useEffect(() => {
		if (messages.length > prevMessagesLengthRef.current) {
			lastMessageRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
		prevMessagesLengthRef.current = messages.length;
	}, [messages.length]);

	// Auto-scroll during streaming only if near bottom
	useEffect(() => {
		if (
			streamingMessage?.isStreaming &&
			streamingMessage.segments.length > 0 &&
			isNearBottom &&
			!userScrollingRef.current
		) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [
		streamingMessage?.segments.length,
		streamingMessage?.isStreaming,
		isNearBottom,
	]);

	if (messages.length === 0 && !streamingMessage) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-4">
				<h1 className="font-display text-4xl text-text-primary mb-2">
					Welcome to FortunaBets
				</h1>
				<p className="text-text-secondary text-center max-w-md">
					Ask about any game. Get AI-powered odds, matchups, and
					insights—instantly.
				</p>
			</div>
		);
	}

	return (
		<div
			ref={scrollContainerRef}
			onScroll={handleScroll}
			className="flex flex-col gap-4 p-4 pb-4 h-full overflow-y-auto"
		>
			{messages.map((message, index) => (
				<div
					key={message.id}
					ref={index === messages.length - 1 ? lastMessageRef : undefined}
					className="scroll-mt-4"
				>
					<MessageItem message={message} />
				</div>
			))}
			{streamingMessage?.isStreaming && (
				<StreamingMessageItem
					segments={streamingMessage.segments}
					isStreaming
				/>
			)}
			{messageQueue.map((msg) => (
				<QueuedMessageItem
					key={msg.id}
					content={msg.content}
					onCancel={() => onRemoveQueued(msg.id)}
				/>
			))}
			<div ref={bottomRef} />
		</div>
	);
}
