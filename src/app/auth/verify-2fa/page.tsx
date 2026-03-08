"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

type Channel = "email" | "phone";

export default function Verify2FAPage() {
	const router = useRouter();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [channel, setChannel] = useState<Channel>("email");
	const [resendCooldown, setResendCooldown] = useState(0);
	const [useBackupCode, setUseBackupCode] = useState(false);
	const hasSentInitial = useRef(false);

	const sendOTP = useCallback(async (ch: Channel) => {
		setResendCooldown(30);
		setChannel(ch);
		setError(null);
		try {
			const res = await fetch("/api/auth/two-factor/send-otp", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-otp-channel": ch,
				},
			});
			if (!res.ok) {
				setError("Failed to send verification code. Please try again.");
				setResendCooldown(0);
			}
		} catch {
			setError("Failed to send verification code. Please try again.");
			setResendCooldown(0);
		}
	}, []);

	useEffect(() => {
		if (hasSentInitial.current) return;
		hasSentInitial.current = true;
		sendOTP("email");
	}, [sendOTP]);

	useEffect(() => {
		if (resendCooldown <= 0) return;
		const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [resendCooldown]);

	async function handleVerify(e: React.FormEvent) {
		e.preventDefault();
		if (!code.trim()) return;
		setError(null);
		setLoading(true);

		if (useBackupCode) {
			const { error } = await authClient.twoFactor.verifyBackupCode({
				code: code.trim(),
			});
			if (error) {
				setError("Invalid backup code. Please try again.");
				setLoading(false);
				return;
			}
		} else {
			const { error } = await authClient.twoFactor.verifyOtp({
				code: code.trim(),
			});
			if (error) {
				setError("Invalid or expired code. Please try again.");
				setLoading(false);
				return;
			}
		}

		router.push("/new");
	}

	function switchChannel(ch: Channel) {
		setCode("");
		setError(null);
		setUseBackupCode(false);
		sendOTP(ch);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center">
					<h1 className="font-display text-3xl text-text-primary">
						{useBackupCode ? "Backup Code" : "Verification Code"}
					</h1>
					<p className="mt-2 text-text-secondary">
						{useBackupCode
							? "Enter one of your backup codes"
							: channel === "email"
								? "We sent a 6-digit code to your email"
								: "We sent a 6-digit code to your phone"}
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
						{error}
					</div>
				)}

				<form onSubmit={handleVerify} className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="code" className="text-sm text-text-secondary">
							{useBackupCode ? "Backup Code" : "Verification Code"}
						</label>
						<Input
							id="code"
							name="code"
							type="text"
							inputMode={useBackupCode ? "text" : "numeric"}
							autoComplete="one-time-code"
							autoFocus
							required
							placeholder={useBackupCode ? "Enter backup code" : "000000"}
							value={code}
							onChange={(e) => setCode(e.target.value)}
							maxLength={useBackupCode ? 10 : 6}
							className="text-center text-lg tracking-widest"
						/>
					</div>

					<Button
						type="submit"
						disabled={loading || !code.trim()}
						className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse disabled:opacity-50"
					>
						{loading ? "Verifying..." : "Verify"}
					</Button>
				</form>

				{!useBackupCode && (
					<div className="space-y-3 text-center text-sm">
						<button
							type="button"
							onClick={() => sendOTP(channel)}
							disabled={resendCooldown > 0}
							className="text-accent-primary hover:text-accent-hover transition-colors disabled:text-text-tertiary"
						>
							{resendCooldown > 0
								? `Resend code (${resendCooldown}s)`
								: "Resend code"}
						</button>

						<div className="text-text-tertiary">
							<button
								type="button"
								onClick={() =>
									switchChannel(channel === "email" ? "phone" : "email")
								}
								className="text-accent-primary hover:text-accent-hover transition-colors"
							>
								Use {channel === "email" ? "phone" : "email"} instead
							</button>
						</div>
					</div>
				)}

				<div className="text-center">
					<button
						type="button"
						onClick={() => {
							setUseBackupCode(!useBackupCode);
							setCode("");
							setError(null);
						}}
						className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
					>
						{useBackupCode
							? "Use verification code instead"
							: "Use a backup code instead"}
					</button>
				</div>
			</div>
		</div>
	);
}
