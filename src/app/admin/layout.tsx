"use client";

import { ArrowLeft, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const navItems = [{ href: "/admin/users", label: "Users", icon: Users }];

export default function AdminLayout({ children }: { children: ReactNode }) {
	const pathname = usePathname();

	return (
		<div className="flex h-dvh flex-col bg-bg-primary">
			<header className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
				<div className="flex items-center gap-3">
					<Link
						href="/settings"
						className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
					>
						<ArrowLeft className="h-4 w-4" />
					</Link>
					<div className="flex items-center gap-2">
						<LayoutDashboard className="h-4 w-4 text-accent-primary" />
						<h1 className="text-sm font-medium text-text-primary">
							Internal Tools
						</h1>
					</div>
				</div>
			</header>

			<div className="flex flex-1 overflow-hidden">
				<nav className="hidden w-48 shrink-0 border-r border-border-subtle p-3 lg:block">
					<div className="space-y-1">
						{navItems.map((item) => {
							const isActive = pathname.startsWith(item.href);
							return (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										"flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
										isActive
											? "bg-accent-muted text-accent-primary"
											: "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
									)}
								>
									<item.icon className="h-4 w-4" />
									{item.label}
								</Link>
							);
						})}
					</div>
				</nav>

				<main className="flex-1 overflow-hidden">{children}</main>
			</div>
		</div>
	);
}
