"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	Chat,
	ChatInitEvent,
	ContentSegment,
	DeltaEvent,
	DoneEvent,
	ErrorEvent,
	Message,
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
	onError?: (error: string | null) => void;
}

function parseSSELines(
	lines: string[],
	onEvent: (type: string, data: unknown) => void,
): void {
	let eventType = "";
	for (const line of lines) {
		if (line.startsWith("event: ")) {
			eventType = line.slice(7);
		} else if (line.startsWith("data: ")) {
			try {
				onEvent(eventType, JSON.parse(line.slice(6)));
			} catch {
				// Skip malformed SSE data lines
			}
		}
	}
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
	const [currentChat, setCurrentChat] = useState<Chat | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
	const abortControllerRef = useRef<AbortController | null>(null);
	const dequeuingRef = useRef(false);
	const streamingSegmentsRef = useRef<ContentSegment[]>([]);
	const sendMessageRef = useRef<((content: string) => Promise<void>) | null>(
		null,
	);
	const disconnectedChatRef = useRef<string | null>(null);
	const onErrorRef = useRef(options.onError);
	onErrorRef.current = options.onError;

	const handleEvent = useCallback((type: string, data: unknown) => {
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
				break;
			}
			case "delta": {
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
			case "result": {
				const segments = streamingSegmentsRef.current;
				for (const segment of segments) {
					if (segment.type === "tool_use") {
						segment.tool.status = "complete";
					}
				}
				setStreamingMessage({
					segments: [...segments],
					isStreaming: true,
				});
				break;
			}
			case "done": {
				const doneData = data as DoneEvent;
				setSessionId(doneData.sessionId);
				break;
			}
			case "error": {
				const errorData = data as ErrorEvent;
				onErrorRef.current?.(errorData.message);
				break;
			}
		}
	}, []);

	const finalizeStreamingMessage = useCallback(() => {
		const segments = streamingSegmentsRef.current;
		if (segments.length === 0) {
			setStreamingMessage(null);
			return;
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

		const assistantMessage: Message = {
			id: `msg-${crypto.randomUUID()}`,
			chatId: currentChat?.id || "",
			role: "assistant",
			content,
			toolInput: toolUses.length > 0 ? toolUses : undefined,
			segments: [...segments],
			createdAt: new Date().toISOString(),
		};
		setMessages((msgs) => [...msgs, assistantMessage]);

		streamingSegmentsRef.current = [];
		setStreamingMessage(null);
	}, [currentChat]);

	const fetchChat = useCallback(
		async (chatId: string, opts?: { silent?: boolean }): Promise<boolean> => {
			try {
				const response = await fetch(`/api/chats/${chatId}`);
				if (!response.ok) {
					if (!opts?.silent) throw new Error("Failed to load chat");
					return false;
				}
				const chat: Chat = await response.json();
				setCurrentChat(chat);
				setMessages(chat.messages || []);
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
		async (chatId: string) => {
			const success = await fetchChat(chatId, { silent: true });
			if (success) {
				disconnectedChatRef.current = null;
				onErrorRef.current?.(null);
			}
		},
		[fetchChat],
	);

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

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";

					parseSSELines(lines, handleEvent);
				}
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}

				if (isNetworkError(error)) {
					const chatId = currentChat?.id;
					if (chatId) {
						disconnectedChatRef.current = chatId;
						onErrorRef.current?.("Connection lost. Reloading response...");
						setTimeout(() => reloadChat(chatId), 2000);
					}
					return;
				}

				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				onErrorRef.current?.(errorMessage);
				setMessageQueue([]);
			} finally {
				setIsLoading(false);
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
			const chatId = disconnectedChatRef.current;
			if (chatId) {
				reloadChat(chatId);
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

	const startNewChat = useCallback(() => {
		setCurrentChat(null);
		setMessages([]);
		setSessionId(null);
		setStreamingMessage(null);
		setMessageQueue([]);
	}, []);

	return {
		messages,
		streamingMessage,
		isLoading,
		currentChat,
		sessionId,
		messageQueue,
		sendMessage,
		stopGeneration,
		queueMessage,
		removeQueuedMessage,
		loadChat: fetchChat,
		startNewChat,
	};
}
