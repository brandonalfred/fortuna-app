"use client";

import { ChevronLeft, Copy, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { useSessionContext } from "@/lib/auth/session-context";

type Step = "idle" | "enabling" | "show-codes" | "disabling" | "regenerating";

export default function SecurityPage() {
	const { session, isPending } = useSessionContext();
	const router = useRouter();
	const [step, setStep] = useState<Step>("idle");
	const [password, setPassword] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(
		null,
	);

	const isEnabled =
		twoFactorEnabled ??
		(session?.user as unknown as { twoFactorEnabled?: boolean })
			?.twoFactorEnabled ??
		false;

	async function handleEnable() {
		if (!password) return;
		setError(null);
		setLoading(true);

		const { data, error } = await authClient.twoFactor.enable({
			password,
		});

		if (error) {
			setError(error.message ?? "Failed to enable 2FA");
			setLoading(false);
			return;
		}

		setBackupCodes(data?.backupCodes ?? []);
		setTwoFactorEnabled(true);
		setStep("show-codes");
		setPassword("");
		setLoading(false);
	}

	async function handleDisable() {
		if (!password) return;
		setError(null);
		setLoading(true);

		const { error } = await authClient.twoFactor.disable({
			password,
		});

		if (error) {
			setError(error.message ?? "Failed to disable 2FA");
			setLoading(false);
			return;
		}

		setTwoFactorEnabled(false);
		setStep("idle");
		setPassword("");
		setLoading(false);
	}

	async function handleRegenerate() {
		if (!password) return;
		setError(null);
		setLoading(true);

		const { data, error } = await authClient.twoFactor.generateBackupCodes({
			password,
		});

		if (error) {
			setError(error.message ?? "Failed to regenerate codes");
			setLoading(false);
			return;
		}

		setBackupCodes(data?.backupCodes ?? []);
		setStep("show-codes");
		setPassword("");
		setLoading(false);
	}

	function copyBackupCodes() {
		navigator.clipboard.writeText(backupCodes.join("\n"));
	}

	function downloadBackupCodes() {
		const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "fortunabets-backup-codes.txt";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 100);
	}

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
					<h2 className="text-lg font-medium text-text-primary">Security</h2>
				</div>
			</div>

			<div className="flex-1 px-4 py-6">
				<div className="mx-auto max-w-md space-y-6">
					<div>
						<h3 className="text-sm font-medium text-text-primary">
							Two-Factor Authentication
						</h3>
						<p className="mt-1 text-xs text-text-tertiary">
							Add an extra layer of security to your account. When enabled,
							you'll need to enter a verification code sent to your email or
							phone when signing in.
						</p>
					</div>

					<div className="rounded-lg bg-bg-secondary p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-text-primary">Status</p>
								<p
									className={`text-xs ${isEnabled ? "text-green-400" : "text-text-tertiary"}`}
								>
									{isEnabled ? "Enabled" : "Disabled"}
								</p>
							</div>
							<div
								className={`h-2.5 w-2.5 rounded-full ${isEnabled ? "bg-green-400" : "bg-text-tertiary"}`}
							/>
						</div>
					</div>

					{step === "idle" && (
						<div className="space-y-3">
							{!isEnabled ? (
								<Button
									onClick={() => setStep("enabling")}
									className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse"
								>
									Enable Two-Factor Authentication
								</Button>
							) : (
								<>
									<Button
										onClick={() => setStep("regenerating")}
										variant="outline"
										className="w-full"
									>
										Regenerate Backup Codes
									</Button>
									<Button
										onClick={() => setStep("disabling")}
										variant="outline"
										className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
									>
										Disable Two-Factor Authentication
									</Button>
								</>
							)}
						</div>
					)}

					{(step === "enabling" ||
						step === "disabling" ||
						step === "regenerating") && (
						<div className="space-y-4">
							<div className="space-y-2">
								<label
									htmlFor="password"
									className="text-sm text-text-secondary"
								>
									Confirm your password
								</label>
								<Input
									id="password"
									type="password"
									autoComplete="current-password"
									autoFocus
									value={password}
									onChange={(e) => {
										setPassword(e.target.value);
										setError(null);
									}}
									placeholder="Enter your password"
								/>
							</div>

							{error && (
								<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
									{error}
								</div>
							)}

							<div className="flex gap-3">
								<Button
									variant="outline"
									onClick={() => {
										setStep("idle");
										setPassword("");
										setError(null);
									}}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button
									onClick={() => {
										if (step === "enabling") handleEnable();
										else if (step === "disabling") handleDisable();
										else handleRegenerate();
									}}
									disabled={loading || !password}
									className={`flex-1 ${
										step === "disabling"
											? "bg-red-500 hover:bg-red-600 text-white"
											: "bg-accent-primary hover:bg-accent-hover text-text-inverse"
									}`}
								>
									{loading
										? "Confirming..."
										: step === "enabling"
											? "Enable"
											: step === "disabling"
												? "Disable"
												: "Regenerate"}
								</Button>
							</div>
						</div>
					)}

					{step === "show-codes" && backupCodes.length > 0 && (
						<div className="space-y-4">
							<div className="rounded-lg bg-warning-subtle border border-warning/30 px-4 py-3">
								<p className="text-sm font-medium text-warning">
									Save your backup codes
								</p>
								<p className="mt-1 text-xs text-warning/80">
									Store these codes in a safe place. Each code can only be used
									once to sign in if you lose access to your verification
									method.
								</p>
							</div>

							<div className="rounded-lg bg-bg-secondary p-4">
								<div className="grid grid-cols-2 gap-2">
									{backupCodes.map((code) => (
										<code
											key={code}
											className="rounded bg-bg-tertiary px-2 py-1.5 text-center text-xs font-mono text-text-primary"
										>
											{code}
										</code>
									))}
								</div>
							</div>

							<div className="flex gap-3">
								<Button
									variant="outline"
									onClick={copyBackupCodes}
									className="flex-1 gap-2"
								>
									<Copy className="h-3.5 w-3.5" />
									Copy
								</Button>
								<Button
									variant="outline"
									onClick={downloadBackupCodes}
									className="flex-1 gap-2"
								>
									<Download className="h-3.5 w-3.5" />
									Download
								</Button>
							</div>

							<Button
								onClick={() => {
									setStep("idle");
									setBackupCodes([]);
								}}
								className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse"
							>
								I've saved my codes
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
