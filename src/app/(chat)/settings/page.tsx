"use client";

import {
	ChevronLeft,
	ChevronRight,
	LayoutDashboard,
	LogOut,
	User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import { useSessionContext } from "@/lib/auth/session-context";
import { getInitials } from "@/lib/utils";

export default function SettingsPage() {
	const { session, isPending } = useSessionContext();
	const router = useRouter();

	if (isPending) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
			</div>
		);
	}

	const user = session?.user;
	if (!user) return null;

	const initials = getInitials(user.firstName, user.lastName);

	function handleSignOut() {
		signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/auth/signin";
				},
			},
		});
	}

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<div className="border-b border-border-subtle px-4 py-3">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => router.back()}
						className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
					>
						<ChevronLeft className="h-5 w-5" />
					</Button>
					<h2 className="text-lg font-medium text-text-primary">Settings</h2>
				</div>
			</div>

			<div className="flex-1 px-4 py-6">
				<div className="mx-auto max-w-md space-y-6">
					<div className="flex flex-col items-center gap-3">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary text-xl font-medium text-text-inverse">
							{initials}
						</div>
					</div>

					<div className="space-y-1">
						<p className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
							Email
						</p>
						<p className="text-sm text-text-primary">{user.email}</p>
					</div>

					<button
						type="button"
						onClick={() => router.push("/settings/profile")}
						className="flex w-full items-center gap-3 rounded-lg bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary"
					>
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-tertiary">
							<User className="h-4 w-4 text-text-secondary" />
						</div>
						<div className="flex-1 text-left">
							<p className="text-sm font-medium text-text-primary">Profile</p>
							<p className="text-xs text-text-tertiary">Personal preferences</p>
						</div>
						<ChevronRight className="h-4 w-4 text-text-tertiary" />
					</button>

					{user.role === "admin" && (
						<button
							type="button"
							onClick={() => router.push("/admin")}
							className="flex w-full items-center gap-3 rounded-lg bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary"
						>
							<div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-muted">
								<LayoutDashboard className="h-4 w-4 text-accent-primary" />
							</div>
							<div className="flex-1 text-left">
								<p className="text-sm font-medium text-text-primary">
									Internal Tools
								</p>
								<p className="text-xs text-text-tertiary">
									User management & admin
								</p>
							</div>
							<ChevronRight className="h-4 w-4 text-text-tertiary" />
						</button>
					)}

					<button
						type="button"
						onClick={handleSignOut}
						className="flex w-full items-center gap-3 rounded-lg bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary"
					>
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10">
							<LogOut className="h-4 w-4 text-red-500" />
						</div>
						<div className="flex-1 text-left">
							<p className="text-sm font-medium text-red-500">Sign Out</p>
							<p className="text-xs text-red-400">End your session</p>
						</div>
					</button>
				</div>
			</div>
		</div>
	);
}
