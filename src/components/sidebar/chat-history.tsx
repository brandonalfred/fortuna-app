"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Chat } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/providers/chat-store-provider";

interface ChatHistoryProps {
	currentChatId?: string;
}

interface ChatListContentProps {
	isLoading: boolean;
	chats: Chat[];
	currentChatId?: string;
	activeChatTitle?: string;
	onDelete: (e: React.MouseEvent, chatId: string) => void;
}

function groupChatsByDate(chats: Chat[]): { label: string; chats: Chat[] }[] {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	const weekAgo = new Date(today);
	weekAgo.setDate(weekAgo.getDate() - 7);

	const groups: Record<string, Chat[]> = {
		Today: [],
		Yesterday: [],
		"Previous 7 days": [],
		Older: [],
	};

	for (const chat of chats) {
		const chatDate = new Date(chat.updatedAt ?? chat.createdAt);
		if (chatDate >= today) groups.Today.push(chat);
		else if (chatDate >= yesterday) groups.Yesterday.push(chat);
		else if (chatDate >= weekAgo) groups["Previous 7 days"].push(chat);
		else groups.Older.push(chat);
	}

	return Object.entries(groups)
		.filter(([, chats]) => chats.length > 0)
		.map(([label, chats]) => ({ label, chats }));
}

function ChatListContent({
	isLoading,
	chats,
	currentChatId,
	activeChatTitle,
	onDelete,
}: ChatListContentProps) {
	const groups = useMemo(() => groupChatsByDate(chats), [chats]);

	if (isLoading) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-10 rounded-md bg-bg-tertiary animate-shimmer"
					/>
				))}
			</div>
		);
	}

	if (chats.length === 0) {
		return (
			<p className="p-2 text-center text-sm text-text-tertiary">
				No conversations yet
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{groups.map((group) => (
				<div key={group.label}>
					<p className="px-3 pb-1 text-[11px] text-text-tertiary uppercase tracking-wider">
						{group.label}
					</p>
					<div className="space-y-0.5">
						{group.chats.map((chat) => {
							const displayTitle =
								chat.id === currentChatId && activeChatTitle
									? activeChatTitle
									: chat.title;

							return (
								<div
									key={chat.id}
									className={cn(
										"group flex w-full items-center justify-between rounded-md text-[13px] transition-colors min-w-0",
										currentChatId === chat.id
											? "bg-bg-tertiary text-text-primary"
											: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
									)}
								>
									<Link
										href={`/chat/${chat.id}`}
										className="min-w-0 flex-1 px-3 py-2.5 text-left"
									>
										<span
											key={displayTitle}
											className="block truncate animate-in fade-in duration-300"
										>
											{displayTitle}
										</span>
									</Link>
									<button
										type="button"
										onClick={(e) => onDelete(e, chat.id)}
										className="mr-2 hidden h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-error-subtle hover:text-error group-hover:flex"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

export function ChatHistory({ currentChatId }: ChatHistoryProps) {
	const [chats, setChats] = useState<Chat[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const pathname = usePathname();
	const router = useRouter();
	const storeChatId = useChatStore((s) => s.currentChat?.id);
	const storeChatTitle = useChatStore((s) => s.currentChat?.title);
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
	}, [fetchChats, pathname]);

	useEffect(() => {
		const handle = () => fetchChats();
		window.addEventListener("chat-renamed", handle);
		return () => window.removeEventListener("chat-renamed", handle);
	}, [fetchChats]);

	const handleDelete = useCallback(
		async (e: React.MouseEvent, chatId: string) => {
			e.stopPropagation();
			e.preventDefault();
			try {
				const response = await fetch(`/api/chats/${chatId}`, {
					method: "DELETE",
				});
				if (response.ok) {
					setChats((prev) => prev.filter((c) => c.id !== chatId));
					if (currentChatId === chatId) {
						router.push("/new");
					}
				}
			} catch {
				// Ignore delete errors
			}
		},
		[currentChatId, router],
	);

	return (
		<div className="flex h-full flex-col bg-bg-secondary">
			<ScrollArea className="flex-1 overflow-hidden">
				<div className="px-2 py-2">
					<ChatListContent
						isLoading={isLoading}
						chats={chats}
						currentChatId={currentChatId}
						activeChatTitle={
							storeChatId === currentChatId ? storeChatTitle : undefined
						}
						onDelete={handleDelete}
					/>
				</div>
			</ScrollArea>
		</div>
	);
}
