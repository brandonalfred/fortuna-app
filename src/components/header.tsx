"use client";

import { LogOut, Menu, MessageSquarePlus, User, X } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { useSessionContext } from "@/lib/auth/session-context";
import { capitalize } from "@/lib/utils";

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
					<>
						<div className="hidden sm:flex items-center gap-2 text-sm text-text-secondary px-2">
							<User className="h-4 w-4" />
							<span>
								{capitalize(session.user.firstName)}{" "}
								{capitalize(session.user.lastName)}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon"
							onClick={() =>
								signOut({
									fetchOptions: {
										onSuccess: () => {
											window.location.href = "/auth/signin";
										},
									},
								})
							}
							className="h-9 w-9 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
							title="Sign out"
						>
							<LogOut className="h-4 w-4" />
						</Button>
					</>
				)}
			</div>
		</header>
	);
}
