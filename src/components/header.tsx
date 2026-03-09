"use client";

import { Menu, MessageSquarePlus, X } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { ChatTitle } from "@/components/chat-title";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/lib/auth/session-context";
import { getInitials } from "@/lib/utils";

interface HeaderProps {
	isSidebarOpen: boolean;
	onToggleSidebar: () => void;
}

export function Header({ isSidebarOpen, onToggleSidebar }: HeaderProps) {
	const { session } = useSessionContext();

	return (
		<header className="flex h-12 shrink-0 items-center bg-bg-primary">
			<div className="flex w-64 shrink-0 items-center gap-3 px-4 max-lg:w-auto">
				<Button
					variant="ghost"
					size="icon"
					onClick={onToggleSidebar}
					className="h-9 w-9 shrink-0 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary lg:hidden"
				>
					{isSidebarOpen ? (
						<X className="h-5 w-5" />
					) : (
						<Menu className="h-5 w-5" />
					)}
				</Button>
				<Link href="/new" className="shrink-0 text-xl">
					<BrandLogo />
				</Link>
			</div>

			<div className="flex min-w-0 flex-1 items-center px-4">
				<ChatTitle />
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						asChild
						className="gap-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
					>
						<Link href="/new">
							<MessageSquarePlus className="h-4 w-4" />
							<span className="hidden sm:inline">New Chat</span>
						</Link>
					</Button>

					{session?.user && (
						<Link
							href="/settings"
							className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-text-inverse transition-colors hover:bg-accent-hover"
							title="Settings"
						>
							{getInitials(session.user.firstName, session.user.lastName)}
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
