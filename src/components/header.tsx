"use client";

import { Menu, MessageSquarePlus, X } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
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
				<h1 className="text-xl">
					<BrandLogo />
				</h1>
			</div>

			<div className="flex items-center gap-2">
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
						className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-xs font-medium text-text-inverse transition-colors hover:bg-accent-hover"
						title="Settings"
					>
						{getInitials(session.user.firstName, session.user.lastName)}
					</Link>
				)}
			</div>
		</header>
	);
}
