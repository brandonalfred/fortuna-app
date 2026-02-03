"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Message, ToolUse } from "@/lib/types";
import { MessageItem } from "./message-item";

interface StreamingMessage {
	content: string;
	toolUses: ToolUse[];
	isStreaming: boolean;
}

interface MessageListProps {
	messages: Message[];
	streamingMessage: StreamingMessage | null;
}

export function MessageList({ messages, streamingMessage }: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const messagesLength = messages.length;
	const streamingContent = streamingMessage?.content;

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messagesLength, streamingContent]);

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
		<ScrollArea className="h-full">
			<div className="flex flex-col gap-4 p-4 pb-32">
				{messages.map((message) => (
					<MessageItem key={message.id} message={message} />
				))}
				{streamingMessage?.isStreaming && (
					<MessageItem
						message={{
							id: "streaming",
							chatId: "",
							role: "assistant",
							content: streamingMessage.content,
							toolInput: streamingMessage.toolUses,
							createdAt: new Date().toISOString(),
						}}
						isStreaming
					/>
				)}
				<div ref={bottomRef} />
			</div>
		</ScrollArea>
	);
}
