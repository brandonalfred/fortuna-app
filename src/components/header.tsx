"use client";

import { Menu, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
	isSidebarOpen: boolean;
	onToggleSidebar: () => void;
	onNewChat: () => void;
}

export function Header({
	isSidebarOpen,
	onToggleSidebar,
	onNewChat,
}: HeaderProps) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-primary px-4">
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="icon"
					onClick={onToggleSidebar}
					className="h-9 w-9 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary lg:hidden"
				>
					{isSidebarOpen ? (
						<X className="h-5 w-5" />
					) : (
						<Menu className="h-5 w-5" />
					)}
				</Button>
				<h1 className="font-display text-xl text-text-primary">
					fortuna<span className="text-accent-primary">bets</span>.ai
				</h1>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={onNewChat}
				className={cn(
					"gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary",
				)}
			>
				<MessageSquarePlus className="h-4 w-4" />
				<span className="hidden sm:inline">New Chat</span>
			</Button>
		</header>
	);
}
