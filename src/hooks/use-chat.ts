"use client";

import { useCallback, useRef, useState } from "react";
import type {
	Chat,
	ChatInitEvent,
	DeltaEvent,
	DoneEvent,
	ErrorEvent,
	Message,
	TextEvent,
	ToolUse,
	ToolUseEvent,
} from "@/lib/types";

interface UseChatOptions {
	onError?: (error: string) => void;
}

interface StreamingMessage {
	content: string;
	toolUses: ToolUse[];
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

	const handleEvent = useCallback(
		(type: string, data: unknown) => {
			switch (type) {
				case "init": {
					const initData = data as ChatInitEvent;
					setSessionId(initData.sessionId);
					setCurrentChat((prev) =>
						prev ? { ...prev, id: initData.chatId } : null,
					);
					break;
				}
				case "text": {
					const textData = data as TextEvent;
					setStreamingMessage((prev) =>
						prev ? { ...prev, content: prev.content + textData.text } : null,
					);
					break;
				}
				case "delta": {
					const deltaData = data as DeltaEvent;
					setStreamingMessage((prev) =>
						prev ? { ...prev, content: prev.content + deltaData.text } : null,
					);
					break;
				}
				case "tool_use": {
					const toolData = data as ToolUseEvent;
					setStreamingMessage((prev) =>
						prev
							? {
									...prev,
									toolUses: [
										...prev.toolUses,
										{
											name: toolData.name,
											input: toolData.input,
											status: "running",
										},
									],
								}
							: null,
					);
					break;
				}
				case "result": {
					setStreamingMessage((prev) =>
						prev
							? {
									...prev,
									toolUses: prev.toolUses.map((t) => ({
										...t,
										status: "complete" as const,
									})),
								}
							: null,
					);
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
		setStreamingMessage((prev) => {
			if (prev?.content) {
				const assistantMessage: Message = {
					id: `msg-${Date.now()}`,
					chatId: currentChat?.id || "",
					role: "assistant",
					content: prev.content,
					toolInput: prev.toolUses.length > 0 ? prev.toolUses : undefined,
					createdAt: new Date().toISOString(),
				};
				setMessages((msgs) => [...msgs, assistantMessage]);
			}
			return null;
		});
	}, [currentChat]);

	const sendMessage = useCallback(
		async (content: string) => {
			if (!content.trim() || isLoading) return;

			const userMessage: Message = {
				id: `temp-${Date.now()}`,
				chatId: currentChat?.id || "",
				role: "user",
				content,
				createdAt: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setIsLoading(true);
			setStreamingMessage({ content: "", toolUses: [], isStreaming: true });

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
