"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSessionContext } from "@/lib/auth/session-context";
import { PREFERENCES_MAX_LENGTH } from "@/lib/validations/user";

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
				<div className="mx-auto max-w-md space-y-4">
					<div>
						<h3 className="text-sm font-medium text-text-primary">
							Personal Preferences
						</h3>
						<p className="mt-1 text-xs text-text-tertiary">
							Tell Fortuna about your betting preferences. These will be
							respected across all conversations.
						</p>
					</div>

					<div className="rounded-lg bg-bg-secondary p-4">
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
								className={`text-xs ${overLimit ? "text-red-400" : "text-text-tertiary"}`}
							>
								{charCount}/{PREFERENCES_MAX_LENGTH}
							</span>
						</div>
					</div>

					{status && (
						<div
							className={`rounded-lg px-3 py-2 text-xs ${
								status.type === "success"
									? "bg-green-900/30 text-green-400"
									: "bg-red-900/30 text-red-400"
							}`}
						>
							{status.message}
						</div>
					)}

					<Button onClick={handleSave} disabled={!canSave} className="w-full">
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}
