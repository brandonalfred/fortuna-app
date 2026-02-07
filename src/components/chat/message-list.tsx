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
	statusMessage?: string | null;
	messageQueue: QueuedMessage[];
	onRemoveQueued: (id: string) => void;
}

const SCROLL_THRESHOLD = 100;
const SCROLL_IDLE_DELAY = 150;

export function MessageList({
	messages,
	streamingMessage,
	statusMessage,
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

		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		setIsNearBottom(distanceFromBottom < SCROLL_THRESHOLD);

		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}
		scrollTimeoutRef.current = setTimeout(() => {
			userScrollingRef.current = false;
		}, SCROLL_IDLE_DELAY);
	}, []);

	useEffect(() => {
		return () => {
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (messages.length > prevMessagesLengthRef.current) {
			lastMessageRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
		prevMessagesLengthRef.current = messages.length;
	}, [messages.length]);

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

	return (
		<div
			ref={scrollContainerRef}
			onScroll={handleScroll}
			className="flex flex-col gap-4 p-4 h-full overflow-y-auto"
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
					statusMessage={statusMessage}
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
