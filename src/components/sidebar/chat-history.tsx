"use client";

import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
	onTitleEdited: (chatId: string, title: string) => void;
}

function ChatListContent({
	isLoading,
	chats,
	currentChatId,
	activeChatTitle,
	onDelete,
	onTitleEdited,
}: ChatListContentProps) {
	const [editingChatId, setEditingChatId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const cancelEditRef = useRef(false);

	useEffect(() => {
		if (editingChatId && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editingChatId]);

	function startEditing(chatId: string, title: string) {
		setEditingChatId(chatId);
		setEditTitle(title);
	}

	function submitEdit(chatId: string) {
		const trimmed = editTitle.trim();
		setEditingChatId(null);
		if (trimmed) {
			onTitleEdited(chatId, trimmed);
		}
	}

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
		<div className="space-y-1">
			{chats.map((chat) => {
				const displayTitle =
					chat.id === currentChatId && activeChatTitle
						? activeChatTitle
						: chat.title;
				const isEditing = editingChatId === chat.id;

				return (
					<div
						key={chat.id}
						className={cn(
							"group flex w-full items-center justify-between rounded-md text-sm transition-colors min-w-0",
							currentChatId === chat.id
								? "bg-bg-tertiary border-l-2 border-accent-primary text-text-primary"
								: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
						)}
					>
						{isEditing ? (
							<input
								ref={inputRef}
								type="text"
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										submitEdit(chat.id);
									} else if (e.key === "Escape") {
										cancelEditRef.current = true;
										setEditingChatId(null);
									}
								}}
								onBlur={() => {
									if (cancelEditRef.current) {
										cancelEditRef.current = false;
										return;
									}
									submitEdit(chat.id);
								}}
								className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary outline-none"
							/>
						) : (
							<Link
								href={`/chat/${chat.id}`}
								className="min-w-0 flex-1 px-3 py-2 text-left"
							>
								<span
									key={displayTitle}
									className="block truncate animate-in fade-in duration-300"
								>
									{displayTitle}
								</span>
							</Link>
						)}
						<div className="mr-2 hidden items-center gap-0.5 group-hover:flex">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
									startEditing(chat.id, displayTitle);
								}}
								className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
							>
								<Pencil className="h-3 w-3" />
							</button>
							<button
								type="button"
								onClick={(e) => onDelete(e, chat.id)}
								className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-error-subtle hover:text-error"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				);
			})}
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

	const handleTitleEdited = useCallback(
		async (chatId: string, title: string) => {
			setChats((prev) =>
				prev.map((c) => (c.id === chatId ? { ...c, title } : c)),
			);
			try {
				await fetch(`/api/chats/${chatId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ title }),
				});
			} catch {
				fetchChats();
			}
		},
		[fetchChats],
	);

	return (
		<div className="flex h-full flex-col bg-bg-secondary">
			<div className="flex items-center justify-between border-b border-border-subtle p-3">
				<span className="text-sm font-medium text-text-secondary">Recents</span>
				<Button
					variant="ghost"
					size="icon"
					asChild
					className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
				>
					<Link href="/new">
						<MessageSquarePlus className="h-4 w-4" />
					</Link>
				</Button>
			</div>
			<ScrollArea className="flex-1 overflow-hidden">
				<div className="p-2">
					<ChatListContent
						isLoading={isLoading}
						chats={chats}
						currentChatId={currentChatId}
						activeChatTitle={
							storeChatId === currentChatId ? storeChatTitle : undefined
						}
						onDelete={handleDelete}
						onTitleEdited={handleTitleEdited}
					/>
				</div>
			</ScrollArea>
		</div>
	);
}
