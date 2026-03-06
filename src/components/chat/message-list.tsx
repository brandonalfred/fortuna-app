"use client";

import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Message,
	QueuedMessage,
	StreamingMessage,
	TodoItem,
} from "@/lib/types";
import {
	MessageItem,
	QueuedMessageItem,
	StreamingMessageItem,
} from "./message-item";
import { TodoWidget } from "./todo-widget";

interface MessageListProps {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
	statusMessage?: string | null;
	messageQueue: QueuedMessage[];
	onRemoveQueued: (id: string) => void;
	todos: TodoItem[];
}

const SCROLL_THRESHOLD = 100;
const SCROLL_IDLE_DELAY = 150;

export function MessageList({
	messages,
	streamingMessage,
	statusMessage,
	messageQueue,
	onRemoveQueued,
	todos,
}: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const lastMessageRef = useRef<HTMLDivElement>(null);
	const lastUserMessageRef = useRef<HTMLDivElement>(null);
	const [isNearBottom, setIsNearBottom] = useState(true);
	const prevMessagesLengthRef = useRef(0);
	const prevStreamingRef = useRef(false);
	const seenMessageIds = useRef<Set<string>>(new Set());

	// Track whether the user initiated the scroll (wheel/touch/keyboard)
	// vs programmatic scrolls (scrollIntoView). Only user-initiated scrolls
	// should suppress auto-scroll behavior.
	const userInitiatedScrollRef = useRef(false);
	const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Mark scroll as user-initiated on wheel/touch/keyboard events
	const markUserScroll = useCallback(() => {
		userInitiatedScrollRef.current = true;
	}, []);

	const handleScroll = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const distanceFromBottom =
			container.scrollHeight - container.scrollTop - container.clientHeight;
		setIsNearBottom(distanceFromBottom < SCROLL_THRESHOLD);

		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}
		scrollTimeoutRef.current = setTimeout(() => {
			userInitiatedScrollRef.current = false;
		}, SCROLL_IDLE_DELAY);
	}, []);

	useEffect(() => {
		return () => {
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
		};
	}, []);

	// Attach user-scroll detection listeners directly on the container
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		container.addEventListener("wheel", markUserScroll, { passive: true });
		container.addEventListener("touchstart", markUserScroll, {
			passive: true,
		});
		container.addEventListener("keydown", markUserScroll);

		return () => {
			container.removeEventListener("wheel", markUserScroll);
			container.removeEventListener("touchstart", markUserScroll);
			container.removeEventListener("keydown", markUserScroll);
		};
	}, [markUserScroll]);

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
				// Stream just ended. Only auto-scroll if the user was already
				// following along at the bottom. If they scrolled up to read
				// earlier content, respect their position.
				if (isNearBottom && !userInitiatedScrollRef.current) {
					bottomRef.current?.scrollIntoView({ behavior: "instant" });
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
	}, [
		messages.length,
		lastMessageRole,
		streamingMessage?.isStreaming,
		isNearBottom,
	]);

	useEffect(() => {
		if (
			streamingMessage?.isStreaming &&
			streamingMessage.segments.length > 0 &&
			isNearBottom &&
			!userInitiatedScrollRef.current
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
	// Only re-sync if the user was near the bottom before the tab switch.
	const wasNearBottomBeforeHide = useRef(true);

	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") {
				wasNearBottomBeforeHide.current = isNearBottom;
				return;
			}
			if (document.visibilityState !== "visible") return;
			if (!streamingMessage?.isStreaming) return;
			if (streamingMessage.segments.length === 0) return;

			// Only catch up if the user was following along before the tab switch
			if (wasNearBottomBeforeHide.current) {
				setIsNearBottom(true);
				userInitiatedScrollRef.current = false;
				requestAnimationFrame(() => {
					bottomRef.current?.scrollIntoView({ behavior: "instant" });
				});
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [
		streamingMessage?.isStreaming,
		streamingMessage?.segments.length,
		isNearBottom,
	]);

	const scrollToBottom = useCallback(() => {
		userInitiatedScrollRef.current = false;
		setIsNearBottom(true);
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const showScrollButton = !isNearBottom;

	return (
		<div className="relative h-full">
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				tabIndex={-1}
				className="flex flex-col gap-4 p-4 h-full overflow-y-auto outline-none"
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
				{todos.length > 0 && (
					<div className="flex w-full justify-start">
						<TodoWidget todos={todos} />
					</div>
				)}
				<div ref={bottomRef} />
			</div>
			{showScrollButton && (
				<button
					type="button"
					onClick={scrollToBottom}
					className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs text-[var(--text-secondary)] shadow-lg border border-[var(--border-default)] backdrop-blur-sm transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
					aria-label="Scroll to bottom"
				>
					<ArrowDown className="size-3.5" />
					<span>New messages</span>
				</button>
			)}
		</div>
	);
}
