"use client";

import { useCallback, useRef, useState } from "react";
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

interface UseChatOptions {
	onError?: (error: string) => void;
}

export interface StreamingMessage {
	segments: ContentSegment[];
	isStreaming: boolean;
}

export function useChat(options: UseChatOptions = {}) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [streamingMessage, setStreamingMessage] =
		useState<StreamingMessage | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [currentChat, setCurrentChat] = useState<Chat | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const streamingSegmentsRef = useRef<ContentSegment[]>([]);

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
			createdAt: new Date().toISOString(),
		};
		setMessages((msgs) => [...msgs, assistantMessage]);

		streamingSegmentsRef.current = [];
		setStreamingMessage(null);
	}, [currentChat]);

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

			try {
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: content,
						chatId: currentChat?.id,
						sessionId,
					}),
					signal: abortControllerRef.current.signal,
				});

				if (!response.ok) {
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
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				options.onError?.(errorMessage);
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
		],
	);

	const stopGeneration = useCallback(() => {
		abortControllerRef.current?.abort();
		setIsLoading(false);
		finalizeStreamingMessage();
	}, [finalizeStreamingMessage]);

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
	}, []);

	return {
		messages,
		streamingMessage,
		isLoading,
		currentChat,
		sessionId,
		sendMessage,
		stopGeneration,
		loadChat,
		startNewChat,
	};
}
