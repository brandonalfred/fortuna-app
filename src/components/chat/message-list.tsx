"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, QueuedMessage, StreamingMessage } from "@/lib/types";
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
	const lastUserMessageRef = useRef<HTMLDivElement>(null);
	const [isNearBottom, setIsNearBottom] = useState(true);
	const prevMessagesLengthRef = useRef(0);
	const prevStreamingRef = useRef(false);
	const seenMessageIds = useRef<Set<string>>(new Set());

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

	const lastUserMessageIndex = useMemo(
		() => messages.findLastIndex((msg) => msg.role === "user"),
		[messages],
	);
	const lastMessageRole = useMemo(
		() => messages[messages.length - 1]?.role,
		[messages],
	);

	function getMessageRef(
		index: number,
	): React.RefObject<HTMLDivElement | null> | undefined {
		if (index === messages.length - 1) return lastMessageRef;
		if (index === lastUserMessageIndex) return lastUserMessageRef;
		return undefined;
	}

	useEffect(() => {
		const hasNewMessages = messages.length > prevMessagesLengthRef.current;
		const wasJustStreaming = prevStreamingRef.current;

		if (hasNewMessages) {
			if (wasJustStreaming) {
				// Stream just ended (normal completion or recovery). In the normal
				// case the user is already at the bottom and this is a no-op. After
				// a tab switch the user may have fallen behind — catch up instantly.
				const container = scrollContainerRef.current;
				if (container) {
					const distanceFromBottom =
						container.scrollHeight -
						container.scrollTop -
						container.clientHeight;
					if (distanceFromBottom >= SCROLL_THRESHOLD) {
						bottomRef.current?.scrollIntoView({ behavior: "instant" });
					}
				}
			} else if (
				lastMessageRole === "assistant" &&
				lastUserMessageRef.current
			) {
				lastUserMessageRef.current.scrollIntoView({
					behavior: "smooth",
					block: "start",
				});
			} else {
				lastMessageRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
				});
			}
		}

		prevMessagesLengthRef.current = messages.length;
		prevStreamingRef.current = streamingMessage?.isStreaming ?? false;
	}, [messages.length, lastMessageRole, streamingMessage?.isStreaming]);

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

	// Re-sync scroll position when the tab returns to the foreground.
	// While the tab is hidden, content grows but scroll position is frozen,
	// causing isNearBottom to drift to false and disabling auto-scroll.
	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState !== "visible") return;
			if (!streamingMessage?.isStreaming) return;
			if (streamingMessage.segments.length === 0) return;

			// Reset tracking state so auto-scroll resumes naturally
			setIsNearBottom(true);
			userScrollingRef.current = false;
			requestAnimationFrame(() => {
				bottomRef.current?.scrollIntoView({ behavior: "instant" });
			});
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [streamingMessage?.isStreaming, streamingMessage?.segments.length]);

	return (
		<div
			ref={scrollContainerRef}
			onScroll={handleScroll}
			className="flex flex-col gap-4 p-4 h-full overflow-y-auto"
		>
			{messages.map((message, index) => {
				const shouldAnimate = !seenMessageIds.current.has(message.id);
				seenMessageIds.current.add(message.id);
				return (
					<div
						key={message.id}
						ref={getMessageRef(index)}
						className="scroll-mt-4"
					>
						<MessageItem message={message} animate={shouldAnimate} />
					</div>
				);
			})}
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
