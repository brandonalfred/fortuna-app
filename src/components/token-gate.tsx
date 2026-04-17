"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/lib/auth/session-context";
import { CLAUDE_TOKEN_PREFIX } from "@/lib/validations/user";

interface TokenGateProps {
	children: ReactNode;
}

export function TokenGate({ children }: TokenGateProps) {
	const router = useRouter();
	const pathname = usePathname();
	const { session, isPending } = useSessionContext();

	if (isPending || !session?.user) return <>{children}</>;
	if (session.user.hasClaudeToken) return <>{children}</>;
	if (pathname === "/settings/profile") return <>{children}</>;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
			<div className="mx-4 max-w-md rounded-2xl border border-border-subtle bg-bg-secondary p-6 shadow-xl">
				<h2 className="font-instrument-serif text-2xl text-text-primary">
					Connect your Claude account
				</h2>
				<p className="mt-2 text-sm text-text-secondary">
					Fortuna runs the agent with your Claude OAuth token. Add yours to
					start chatting.
				</p>

				<div className="mt-4 rounded-xl bg-bg-tertiary px-3 py-3 text-xs text-text-tertiary">
					Run{" "}
					<code className="font-mono text-text-secondary">
						claude setup-token
					</code>{" "}
					in your terminal, sign in, then copy the token (starts with{" "}
					<code className="font-mono">{CLAUDE_TOKEN_PREFIX}</code>) and paste it
					on the next screen.
				</div>

				<Button
					className="mt-5 w-full"
					onClick={() => router.push("/settings/profile")}
				>
					Set Up Token
				</Button>
			</div>
		</div>
	);
}
