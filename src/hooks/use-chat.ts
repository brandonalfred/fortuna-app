"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hydrateMessageSegments } from "@/lib/segments";
import type {
	Chat,
	ChatInitEvent,
	ContentSegment,
	DeltaEvent,
	DoneEvent,
	ErrorEvent,
	Message,
	ResultEvent,
	StatusEvent,
	ThinkingEvent,
	ToolUseEvent,
} from "@/lib/types";

function isNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const msg = error.message.toLowerCase();
	return (
		error.name === "TypeError" ||
		msg.includes("failed to fetch") ||
		msg.includes("load failed") ||
		msg.includes("network") ||
		msg.includes("the operation couldn't be completed")
	);
}

interface UseChatOptions {
	chatId?: string;
	onError?: (error: string | null) => void;
	onChatCreated?: (chatId: string) => void;
	onChatNotFound?: () => void;
}

interface ParseSSEResult {
	eventType: string;
	sawTurnComplete: boolean;
}

function parseSSELines(
	lines: string[],
	onEvent: (type: string, data: unknown) => void,
	currentEventType: string,
): ParseSSEResult {
	let eventType = currentEventType;
	let sawTurnComplete = false;
	for (const line of lines) {
		if (line.startsWith("event: ")) {
			eventType = line.slice(7);
		} else if (line.startsWith("data: ")) {
			try {
				onEvent(eventType, JSON.parse(line.slice(6)));
				if (eventType === "turn_complete") {
					sawTurnComplete = true;
				}
			} catch (e) {
				console.warn("[SSE] Failed to parse data line:", line.slice(6, 100), e);
			}
		}
	}
	return { eventType, sawTurnComplete };
}

export interface StreamingMessage {
	segments: ContentSegment[];
	isStreaming: boolean;
}

export interface QueuedMessage {
	id: string;
	content: string;
}

export function useChat(options: UseChatOptions = {}) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingMessage, setStreamingMessage] =
		useState<StreamingMessage | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [currentChat, setCurrentChat] = useState<Chat | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
	const abortControllerRef = useRef<AbortController | null>(null);
	const dequeuingRef = useRef(false);
	const streamingSegmentsRef = useRef<ContentSegment[]>([]);
	const sendMessageRef = useRef<((content: string) => Promise<void>) | null>(
		null,
	);
	const messageQueueRef = useRef<QueuedMessage[]>([]);
	const stopReasonRef = useRef<{
		stopReason: string;
		subtype: string;
	} | null>(null);
	const disconnectedChatRef = useRef<string | null>(null);
	const lastReloadAttemptRef = useRef(0);
	const loadedChatIdRef = useRef<string | undefined>(undefined);
	const creatingChatRef = useRef(false);
	const onErrorRef = useRef(options.onError);
	const onChatCreatedRef = useRef(options.onChatCreated);
	const onChatNotFoundRef = useRef(options.onChatNotFound);
	onErrorRef.current = options.onError;
	onChatCreatedRef.current = options.onChatCreated;
	onChatNotFoundRef.current = options.onChatNotFound;

	const chatId = options.chatId;

	const markToolsComplete = useCallback(() => {
		for (const segment of streamingSegmentsRef.current) {
			if (segment.type === "tool_use") {
				segment.tool.status = "complete";
			}
		}
		setStreamingMessage({
			segments: [...streamingSegmentsRef.current],
			isStreaming: true,
		});
	}, []);

	const handleEvent = useCallback(
		(type: string, data: unknown) => {
			switch (type) {
				case "init": {
					const initData = data as ChatInitEvent;
					setSessionId(initData.sessionId);
					setCurrentChat((prev) => ({
						id: initData.chatId,
						sessionId: initData.sessionId,
						title: prev?.title || "",
						createdAt: prev?.createdAt || new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						messages: prev?.messages || [],
					}));
					if (!chatId) {
						creatingChatRef.current = true;
						onChatCreatedRef.current?.(initData.chatId);
					}
					break;
				}
				case "status": {
					const statusData = data as StatusEvent;
					setStatusMessage(statusData.message);
					break;
				}
				case "delta": {
					setStatusMessage(null);
					const deltaData = data as DeltaEvent;
					const segments = streamingSegmentsRef.current;
					const lastSegment = segments[segments.length - 1];

					if (lastSegment?.type === "text") {
						lastSegment.text += deltaData.text;
					} else {
						segments.push({ type: "text", text: deltaData.text });
					}

					setStreamingMessage({
						segments: [...segments],
						isStreaming: true,
					});
					break;
				}
				case "thinking": {
					setStatusMessage(null);
					const thinkingData = data as ThinkingEvent;
					streamingSegmentsRef.current.push({
						type: "thinking",
						thinking: thinkingData.thinking,
						isComplete: true,
					});
					setStreamingMessage({
						segments: [...streamingSegmentsRef.current],
						isStreaming: true,
					});
					break;
				}
				case "tool_use": {
					const toolData = data as ToolUseEvent;
					streamingSegmentsRef.current.push({
						type: "tool_use",
						tool: {
							name: toolData.name,
							input: toolData.input,
							status: "running",
						},
					});
					setStreamingMessage({
						segments: [...streamingSegmentsRef.current],
						isStreaming: true,
					});
					break;
				}
				case "turn_complete": {
					markToolsComplete();
					break;
				}
				case "result": {
					markToolsComplete();
					const { stop_reason, subtype } = data as ResultEvent;
					const abnormalStop = stop_reason && stop_reason !== "end_turn";

					if (abnormalStop || subtype !== "success") {
						stopReasonRef.current = {
							stopReason: abnormalStop ? stop_reason : subtype,
							subtype,
						};
					}
					break;
				}
				case "done": {
					setStatusMessage(null);
					const doneData = data as DoneEvent;
					setSessionId(doneData.sessionId);
					break;
				}
				case "error": {
					setStatusMessage(null);
					const errorData = data as ErrorEvent;
					onErrorRef.current?.(errorData.message);
					break;
				}
			}
		},
		[chatId, markToolsComplete],
	);

	const finalizeStreamingMessage = useCallback(() => {
		const segments = streamingSegmentsRef.current;
		streamingSegmentsRef.current = [];
		setStreamingMessage(null);

		if (segments.length === 0) return;

		const stopInfo = stopReasonRef.current;
		stopReasonRef.current = null;

		if (stopInfo) {
			segments.push({
				type: "stop_notice",
				stopReason: stopInfo.stopReason,
				subtype: stopInfo.subtype,
			});
		}

		const content = segments
			.filter(
				(s): s is Extract<ContentSegment, { type: "text" }> =>
					s.type === "text",
			)
			.map((s) => s.text)
			.join("");

		const toolUses = segments
			.filter(
				(s): s is Extract<ContentSegment, { type: "tool_use" }> =>
					s.type === "tool_use",
			)
			.map((s) => s.tool);

		setMessages((msgs) => [
			...msgs,
			{
				id: `msg-${crypto.randomUUID()}`,
				chatId: currentChat?.id || "",
				role: "assistant",
				content,
				stopReason: stopInfo?.stopReason,
				toolInput: toolUses.length > 0 ? toolUses : undefined,
				segments: [...segments],
				createdAt: new Date().toISOString(),
			},
		]);
	}, [currentChat]);

	const fetchChat = useCallback(
		async (
			fetchChatId: string,
			opts?: { silent?: boolean },
		): Promise<boolean> => {
			try {
				const response = await fetch(`/api/chats/${fetchChatId}`);
				if (!response.ok) {
					if (!opts?.silent) throw new Error("Failed to load chat");
					return false;
				}
				const chat: Chat = await response.json();
				setCurrentChat(chat);
				setMessages((chat.messages || []).map(hydrateMessageSegments));
				setSessionId(chat.sessionId);
				setMessageQueue([]);
				return true;
			} catch (error) {
				if (!opts?.silent) {
					const errorMessage =
						error instanceof Error ? error.message : "Failed to load chat";
					onErrorRef.current?.(errorMessage);
				}
				return false;
			}
		},
		[],
	);

	const reloadChat = useCallback(
		async (reloadChatId: string) => {
			const success = await fetchChat(reloadChatId, { silent: true });
			if (success) {
				disconnectedChatRef.current = null;
				onErrorRef.current?.(null);
			}
		},
		[fetchChat],
	);

	const startNewChat = useCallback(() => {
		setCurrentChat(null);
		setMessages([]);
		setSessionId(null);
		setStreamingMessage(null);
		setMessageQueue([]);
	}, []);

	useEffect(() => {
		if (creatingChatRef.current) {
			creatingChatRef.current = false;
			loadedChatIdRef.current = chatId;
			return;
		}

		abortControllerRef.current?.abort();

		if (chatId) {
			if (loadedChatIdRef.current === chatId) return;
			loadedChatIdRef.current = chatId;
			fetchChat(chatId).then((success) => {
				if (!success) {
					loadedChatIdRef.current = undefined;
					onChatNotFoundRef.current?.();
				}
			});
		} else {
			loadedChatIdRef.current = undefined;
			startNewChat();
		}
	}, [chatId, fetchChat, startNewChat]);

	const sendMessage = useCallback(
		async (content: string) => {
			if (!content.trim() || isLoading) return;

			const userMessage: Message = {
				id: `temp-${crypto.randomUUID()}`,
				chatId: currentChat?.id || "",
				role: "user",
				content,
				createdAt: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsLoading(true);
			streamingSegmentsRef.current = [];
			setStreamingMessage({ segments: [], isStreaming: true });

			abortControllerRef.current = new AbortController();
			const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

			try {
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: content,
						chatId: currentChat?.id,
						sessionId,
						timezone: userTimezone,
					}),
					signal: abortControllerRef.current.signal,
				});

				if (!response.ok) {
					if (response.status === 401) {
						window.location.href = "/auth/signin";
						return;
					}
					throw new Error("Failed to send message");
				}

				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error("No response body");
				}

				const decoder = new TextDecoder();
				let buffer = "";
				let eventType = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					const result = parseSSELines(lines, handleEvent, eventType);
					eventType = result.eventType;

					if (result.sawTurnComplete && messageQueueRef.current.length > 0) {
						abortControllerRef.current?.abort();
						break;
					}
				}
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}

				if (isNetworkError(error)) {
					const disconnectedId = currentChat?.id;
					if (disconnectedId) {
						disconnectedChatRef.current = disconnectedId;
						onErrorRef.current?.("Connection lost. Reloading response...");
						setTimeout(() => reloadChat(disconnectedId), 2000);
					}
					return;
				}

				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				onErrorRef.current?.(errorMessage);
				setMessageQueue([]);
			} finally {
				setIsLoading(false);
				setStatusMessage(null);
				finalizeStreamingMessage();
			}
		},
		[
			currentChat,
			sessionId,
			isLoading,
			handleEvent,
			finalizeStreamingMessage,
			reloadChat,
		],
	);

	const stopGeneration = useCallback(() => {
		abortControllerRef.current?.abort();
		setIsLoading(false);
		setMessageQueue([]);
		finalizeStreamingMessage();
	}, [finalizeStreamingMessage]);

	const queueMessage = useCallback((content: string) => {
		setMessageQueue((prev) => [...prev, { id: crypto.randomUUID(), content }]);
	}, []);

	const removeQueuedMessage = useCallback((id: string) => {
		setMessageQueue((prev) => prev.filter((msg) => msg.id !== id));
	}, []);

	useEffect(() => {
		messageQueueRef.current = messageQueue;
	}, [messageQueue]);

	useEffect(() => {
		sendMessageRef.current = sendMessage;
	}, [sendMessage]);

	useEffect(() => {
		if (!isLoading && !dequeuingRef.current && messageQueue.length > 0) {
			const [next, ...rest] = messageQueue;
			setMessageQueue(rest);
			dequeuingRef.current = true;
			setTimeout(async () => {
				try {
					await sendMessageRef.current?.(next.content);
				} finally {
					dequeuingRef.current = false;
				}
			}, 0);
		}
	}, [isLoading, messageQueue]);

	useEffect(() => {
		const tryReload = () => {
			const disconnectedId = disconnectedChatRef.current;
			if (disconnectedId && Date.now() - lastReloadAttemptRef.current > 5000) {
				lastReloadAttemptRef.current = Date.now();
				reloadChat(disconnectedId);
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				tryReload();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", tryReload);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", tryReload);
		};
	}, [reloadChat]);

	return {
		messages,
		streamingMessage,
		isLoading,
		statusMessage,
		currentChat,
		sessionId,
		messageQueue,
		sendMessage,
		stopGeneration,
		queueMessage,
		removeQueuedMessage,
	};
}
