"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { useSessionContext } from "@/lib/auth/session-context";
import {
	CLAUDE_TOKEN_PREFIX,
	PREFERENCES_MAX_LENGTH,
} from "@/lib/validations/user";

export default function ProfilePage() {
	const { session, isPending } = useSessionContext();
	const router = useRouter();

	const [value, setValue] = useState("");
	const [lastSavedValue, setLastSavedValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [status, setStatus] = useState<{
		type: "success" | "error";
		message: string;
	} | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		if (session?.user && !loaded) {
			const initial =
				(session.user as { preferences?: string | null }).preferences ?? "";
			setValue(initial);
			setLastSavedValue(initial);
			setLoaded(true);
		}
	}, [session, loaded]);

	const charCount = value.length;
	const overLimit = charCount > PREFERENCES_MAX_LENGTH;
	const hasChanges = value !== lastSavedValue;
	const canSave = hasChanges && !overLimit && !saving;

	const handleSave = useCallback(async () => {
		if (!canSave) return;

		setSaving(true);
		setStatus(null);

		try {
			const res = await fetch("/api/user/preferences", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					preferences: value || null,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error ?? "Failed to save preferences");
			}

			setLastSavedValue(value);
			setStatus({ type: "success", message: "Preferences saved" });
		} catch (err) {
			setStatus({
				type: "error",
				message:
					err instanceof Error ? err.message : "Failed to save preferences",
			});
		} finally {
			setSaving(false);
		}
	}, [canSave, value]);

	if (isPending) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
			</div>
		);
	}

	if (!session?.user) return null;

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
					<h2 className="text-lg font-medium text-text-primary">Profile</h2>
				</div>
			</div>

			<div className="flex-1 px-4 py-6">
				<div className="mx-auto max-w-md space-y-8">
					<section className="space-y-4">
						<div>
							<h3 className="text-sm font-medium text-text-primary">
								Personal Preferences
							</h3>
							<p className="mt-1 text-xs text-text-tertiary">
								Tell Fortuna about your betting preferences. These will be
								respected across all conversations.
							</p>
						</div>

						<div className="rounded-xl bg-bg-secondary p-4">
							<textarea
								value={value}
								onChange={(e) => {
									setValue(e.target.value);
									setStatus(null);
								}}
								placeholder="I.e. do not recommend me Rudy Gobert props"
								rows={5}
								className="w-full resize-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
							/>
							<div className="mt-2 flex items-center justify-between">
								<span
									className={`text-xs ${overLimit ? "text-error" : "text-text-tertiary"}`}
								>
									{charCount}/{PREFERENCES_MAX_LENGTH}
								</span>
							</div>
						</div>

						{status && (
							<div
								className={`rounded-xl px-3 py-2 text-xs ${
									status.type === "success"
										? "bg-success-subtle text-success"
										: "bg-error-subtle text-error"
								}`}
							>
								{status.message}
							</div>
						)}

						<Button onClick={handleSave} disabled={!canSave} className="w-full">
							{saving ? "Saving..." : "Save"}
						</Button>
					</section>

					<ClaudeTokenSection hasToken={session.user.hasClaudeToken} />
				</div>
			</div>
		</div>
	);
}

function ClaudeTokenSection({ hasToken }: { hasToken: boolean }) {
	const router = useRouter();
	const [token, setToken] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [confirmRemove, setConfirmRemove] = useState(false);
	const [removing, setRemoving] = useState(false);

	const refreshSession = useCallback(async () => {
		await authClient.getSession({ query: { disableCookieCache: true } });
		router.refresh();
	}, [router]);

	const handleSave = useCallback(async () => {
		if (!token.trim() || submitting) return;
		setError(null);
		setSubmitting(true);
		try {
			const res = await fetch("/api/user/claude-token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token: token.trim() }),
			});
			const data = await res.json().catch(() => null);
			if (!res.ok || data?.ok === false) {
				throw new Error(data?.message ?? "Failed to save token");
			}
			setToken("");
			await refreshSession();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save token");
		} finally {
			setSubmitting(false);
		}
	}, [token, submitting, refreshSession]);

	const handleRemove = useCallback(async () => {
		setRemoving(true);
		try {
			const res = await fetch("/api/user/claude-token", { method: "DELETE" });
			if (!res.ok) throw new Error("Failed to remove token");
			await refreshSession();
			setConfirmRemove(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove token");
		} finally {
			setRemoving(false);
		}
	}, [refreshSession]);

	return (
		<section className="space-y-4">
			<div>
				<h3 className="text-sm font-medium text-text-primary">
					Claude OAuth Token
				</h3>
				<p className="mt-1 text-xs text-text-tertiary">
					Fortuna runs the agent with your Claude account. Paste a token from
					your Claude Max plan to enable chat.
				</p>
			</div>

			<div className="rounded-xl bg-bg-secondary p-4 space-y-3">
				{hasToken ? (
					<>
						<div className="flex items-center justify-between gap-3">
							<span className="font-mono text-sm text-text-secondary">
								sk-ant-•••••••connected
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setConfirmRemove(true)}
							>
								Remove
							</Button>
						</div>
						<p className="text-xs text-text-tertiary">
							Token connected. The agent uses this for every chat.
						</p>
					</>
				) : (
					<>
						<Input
							type="password"
							value={token}
							onChange={(e) => {
								setToken(e.target.value);
								setError(null);
							}}
							placeholder={`${CLAUDE_TOKEN_PREFIX}...`}
							autoComplete="off"
							spellCheck={false}
						/>
						<Button
							onClick={handleSave}
							disabled={!token.trim() || submitting}
							className="w-full"
						>
							{submitting ? "Verifying…" : "Save"}
						</Button>
					</>
				)}

				{error && (
					<div className="rounded-xl bg-error-subtle px-3 py-2 text-xs text-error">
						{error}
					</div>
				)}
			</div>

			<Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove Claude token?</DialogTitle>
						<DialogDescription>
							This will disconnect your Claude account and block access to chats
							until you re-add a token.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmRemove(false)}
							disabled={removing}
						>
							Cancel
						</Button>
						<Button onClick={handleRemove} disabled={removing}>
							{removing ? "Removing…" : "Remove"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
