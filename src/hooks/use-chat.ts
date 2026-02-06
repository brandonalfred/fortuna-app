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
	ToolUse,
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
	onError?: (error: string) => void;
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
					const newTool: ToolUse = {
						name: toolData.name,
						input: toolData.input,
						status: "running",
					};
					streamingSegmentsRef.current.push({
						type: "tool_use",
						tool: newTool,
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
					options.onError?.(errorData.message);
					break;
				}
			}
		},
		[options],
	);

	const finalizeStreamingMessage = useCallback(() => {
		const segments = streamingSegmentsRef.current;
		if (segments.length === 0) {
			streamingSegmentsRef.current = [];
			setStreamingMessage(null);
			return;
		}

		const content = segments
			.filter((s) => s.type === "text")
			.map((s) => (s as { type: "text"; text: string }).text)
			.join("");

		const toolUses = segments
			.filter((s) => s.type === "tool_use")
			.map((s) => (s as { type: "tool_use"; tool: ToolUse }).tool);

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

	const reloadChat = useCallback(
		async (chatId: string) => {
			try {
				const response = await fetch(`/api/chats/${chatId}`);
				if (!response.ok) return;
				const chat: Chat = await response.json();
				setCurrentChat(chat);
				setMessages(chat.messages || []);
				setSessionId(chat.sessionId);
				setMessageQueue([]);
				disconnectedChatRef.current = null;
				options.onError?.(null as unknown as string);
			} catch {
				// Will retry on next visibility change
			}
		},
		[options],
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

					let eventType = "";
					for (const line of lines) {
						if (line.startsWith("event: ")) {
							eventType = line.slice(7);
						} else if (line.startsWith("data: ")) {
							const data = JSON.parse(line.slice(6));
							handleEvent(eventType, data);
						}
					}
				}
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}

				if (isNetworkError(error)) {
					// Connection dropped (e.g. mobile tab backgrounded).
					// The agent may still be running server-side — reload to get results.
					const chatId = currentChat?.id;
					finalizeStreamingMessage();
					setIsLoading(false);
					if (chatId) {
						disconnectedChatRef.current = chatId;
						options.onError?.("Connection lost. Reloading response...");
						setTimeout(() => reloadChat(chatId), 2000);
					}
					return;
				}

				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				options.onError?.(errorMessage);
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
			options,
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

	// Auto-send next queued message when loading completes
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

	// Reload chat when tab becomes visible after a disconnection
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				const chatId = disconnectedChatRef.current;
				if (chatId) {
					reloadChat(chatId);
				}
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [reloadChat]);

	const loadChat = useCallback(
		async (chatId: string) => {
			try {
				const response = await fetch(`/api/chats/${chatId}`);
				if (!response.ok) {
					throw new Error("Failed to load chat");
				}
				const chat: Chat = await response.json();
				setCurrentChat(chat);
				setMessages(chat.messages || []);
				setSessionId(chat.sessionId);
				setMessageQueue([]);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Failed to load chat";
				options.onError?.(errorMessage);
			}
		},
		[options],
	);

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
		loadChat,
		startNewChat,
	};
}
