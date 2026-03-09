"use client";

import { ChevronDown, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useInvalidateChat } from "@/hooks/use-chat-query";
import { useChatStore } from "@/providers/chat-store-provider";

export function ChatTitle() {
	const currentChat = useChatStore((s) => s.currentChat);
	const updateTitle = useChatStore((s) => s.updateTitle);
	const invalidateChat = useInvalidateChat();
	const [isRenaming, setIsRenaming] = useState(false);
	const [editValue, setEditValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isRenaming) {
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		}
	}, [isRenaming]);

	const handleRename = useCallback(() => {
		if (!currentChat) return;
		setEditValue(currentChat.title);
		setIsRenaming(true);
	}, [currentChat]);

	const handleCancel = useCallback(() => {
		setIsRenaming(false);
		setEditValue("");
	}, []);

	const handleSave = useCallback(async () => {
		if (!currentChat || isSaving) return;
		const trimmed = editValue.trim();
		if (!trimmed || trimmed === currentChat.title) {
			handleCancel();
			return;
		}

		setIsSaving(true);
		try {
			const res = await fetch(`/api/chats/${currentChat.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: trimmed }),
			});
			if (res.ok) {
				updateTitle(trimmed);
				invalidateChat(currentChat.id);
				window.dispatchEvent(new CustomEvent("chat-renamed"));
			}
		} finally {
			setIsSaving(false);
			setIsRenaming(false);
			setEditValue("");
		}
	}, [
		currentChat,
		editValue,
		isSaving,
		updateTitle,
		invalidateChat,
		handleCancel,
	]);

	if (!currentChat) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary data-[state=open]:bg-bg-tertiary data-[state=open]:text-text-primary focus:outline-none">
					<span className="max-w-[140px] truncate sm:max-w-[200px] md:max-w-[300px]">
						{currentChat.title}
					</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onSelect={handleRename}>
						<Pencil className="h-4 w-4" />
						Rename
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={isRenaming}
				onOpenChange={(open) => !open && handleCancel()}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Rename chat</DialogTitle>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							handleSave();
						}}
					>
						<Input
							ref={inputRef}
							value={editValue}
							onChange={(e) => setEditValue(e.target.value)}
							maxLength={200}
							disabled={isSaving}
						/>
						<DialogFooter className="mt-4">
							<Button
								type="button"
								variant="ghost"
								onClick={handleCancel}
								disabled={isSaving}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={isSaving}>
								Save
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
