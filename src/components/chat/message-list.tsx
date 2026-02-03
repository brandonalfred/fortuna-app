"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentSegment, Message } from "@/lib/types";
import { MessageItem, StreamingMessageItem } from "./message-item";

export interface StreamingMessage {
	segments: ContentSegment[];
	isStreaming: boolean;
}

interface MessageListProps {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
}

export function MessageList({ messages, streamingMessage }: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [isNearBottom, setIsNearBottom] = useState(true);
	const messagesLength = messages.length;

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

	useEffect(() => {
		if (isNearBottom && !userScrollingRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messagesLength, isNearBottom]);

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
			className="flex flex-col gap-4 p-4 pb-32 h-full overflow-y-auto"
		>
			{messages.map((message) => (
				<MessageItem key={message.id} message={message} />
			))}
			{streamingMessage?.isStreaming && (
				<StreamingMessageItem
					segments={streamingMessage.segments}
					isStreaming
				/>
			)}
			<div ref={bottomRef} />
		</div>
	);
}
