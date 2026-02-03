"use client";

import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Chat } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatHistoryProps {
	currentChatId?: string;
	onSelectChat: (chatId: string) => void;
	onNewChat: () => void;
}

export function ChatHistory({
	currentChatId,
	onSelectChat,
	onNewChat,
}: ChatHistoryProps) {
	const [chats, setChats] = useState<Chat[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const fetchChats = useCallback(async () => {
		try {
			const response = await fetch("/api/chats");
			if (response.ok) {
				const data = await response.json();
				setChats(data);
			}
		} catch {
			// Ignore fetch errors
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchChats();
	}, [fetchChats]);

	const handleDelete = useCallback(
		async (e: React.MouseEvent, chatId: string) => {
			e.stopPropagation();
			try {
				const response = await fetch(`/api/chats/${chatId}`, {
					method: "DELETE",
				});
				if (response.ok) {
					setChats((prev) => prev.filter((c) => c.id !== chatId));
					if (currentChatId === chatId) {
						onNewChat();
					}
				}
			} catch {
				// Ignore delete errors
			}
		},
		[currentChatId, onNewChat],
	);

	return (
		<div className="flex h-full flex-col bg-bg-secondary">
			<div className="flex items-center justify-between border-b border-border-subtle p-3">
				<span className="text-sm font-medium text-text-secondary">History</span>
				<Button
					variant="ghost"
					size="icon"
					onClick={onNewChat}
					className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
				>
					<MessageSquarePlus className="h-4 w-4" />
				</Button>
			</div>
			<ScrollArea className="flex-1">
				<div className="p-2">
					{isLoading ? (
						<div className="space-y-2">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="h-10 rounded-md bg-bg-tertiary animate-shimmer"
								/>
							))}
						</div>
					) : chats.length === 0 ? (
						<p className="p-2 text-center text-sm text-text-tertiary">
							No conversations yet
						</p>
					) : (
						<div className="space-y-1">
							{chats.map((chat) => (
								<div
									key={chat.id}
									className={cn(
										"group flex w-full items-center justify-between rounded-md text-sm transition-colors",
										currentChatId === chat.id
											? "bg-bg-tertiary border-l-2 border-accent-primary text-text-primary"
											: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
									)}
								>
									<button
										type="button"
										onClick={() => onSelectChat(chat.id)}
										className="flex-1 cursor-pointer truncate px-3 py-2 text-left"
									>
										{chat.title}
									</button>
									<button
										type="button"
										onClick={(e) => handleDelete(e, chat.id)}
										className="mr-2 hidden h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-error-subtle hover:text-error group-hover:flex"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
