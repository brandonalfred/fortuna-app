"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	PASSWORD_MAX_LENGTH,
	passwordRequirements,
} from "@/lib/validations/auth";

function formatPhoneNumber(value: string): string {
	const digits = value.replace(/\D/g, "").slice(0, 10);
	if (digits.length <= 3) return digits;
	if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function stripPhoneFormatting(value: string): string {
	return value.replace(/\D/g, "");
}

function parseRegistrationError(
	res: Response,
	json: Record<string, unknown>,
): string {
	if (res.status === 409) {
		return "An account with this email already exists";
	}

	const fieldErrors = (json.details as Record<string, unknown>)?.fieldErrors;
	if (fieldErrors) {
		const firstError = Object.values(fieldErrors)[0];
		return Array.isArray(firstError) ? firstError[0] : "Invalid input";
	}

	return (json.error as string) || "Something went wrong";
}

export default function SignUpPage() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [phoneNumber, setPhoneNumber] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showMaxLengthWarning, setShowMaxLengthWarning] = useState(false);
	const maxLengthTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

	function handlePasswordChange(value: string) {
		if (value.length > PASSWORD_MAX_LENGTH) {
			setShowMaxLengthWarning(true);
			if (maxLengthTimerRef.current) clearTimeout(maxLengthTimerRef.current);
			maxLengthTimerRef.current = setTimeout(
				() => setShowMaxLengthWarning(false),
				3000,
			);
			return;
		}
		setPassword(value);
	}

	const requirementResults = passwordRequirements.map((req) => ({
		label: req.label,
		met: req.test(password),
	}));
	const allRequirementsMet = requirementResults.every((r) => r.met);
	const passwordsMatch = password === confirmPassword;
	const canSubmit =
		allRequirementsMet && (confirmPassword === "" || passwordsMatch);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!allRequirementsMet || !passwordsMatch) return;

		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const data = {
			firstName: formData.get("firstName") as string,
			lastName: formData.get("lastName") as string,
			email,
			phoneNumber: stripPhoneFormatting(phoneNumber),
			password,
		};

		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!res.ok) {
				const json = await res.json();
				setError(parseRegistrationError(res, json));
				return;
			}

			await signIn("credentials", {
				email,
				password,
				callbackUrl: "/",
			});
		} catch {
			setError("Something went wrong. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center">
					<h1 className="font-display text-3xl text-text-primary">
						Create an account
					</h1>
					<p className="mt-2 text-text-secondary">
						Sign up to start using FortunaBets
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label
								htmlFor="firstName"
								className="text-sm text-text-secondary"
							>
								First name
							</label>
							<Input
								id="firstName"
								name="firstName"
								type="text"
								autoComplete="given-name"
								required
								placeholder="John"
							/>
						</div>
						<div className="space-y-2">
							<label htmlFor="lastName" className="text-sm text-text-secondary">
								Last name
							</label>
							<Input
								id="lastName"
								name="lastName"
								type="text"
								autoComplete="family-name"
								required
								placeholder="Doe"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<label htmlFor="email" className="text-sm text-text-secondary">
							Email
						</label>
						<Input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							required
							placeholder="you@example.com"
						/>
					</div>

					<div className="space-y-2">
						<label
							htmlFor="phoneNumber"
							className="text-sm text-text-secondary"
						>
							Phone number
						</label>
						<Input
							id="phoneNumber"
							name="phoneNumber"
							type="tel"
							autoComplete="tel"
							required
							maxLength={14}
							placeholder="(555) 000-0000"
							value={phoneNumber}
							onChange={(e) =>
								setPhoneNumber(formatPhoneNumber(e.target.value))
							}
						/>
					</div>

					<div className="space-y-2">
						<label htmlFor="password" className="text-sm text-text-secondary">
							Password
						</label>
						<div className="relative">
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								required
								placeholder="Create a password"
								value={password}
								onChange={(e) => handlePasswordChange(e.target.value)}
							/>
							{showMaxLengthWarning && (
								<div className="absolute -top-10 left-0 right-0 rounded-md bg-error-subtle border border-error/30 px-3 py-1.5 text-xs text-error text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
									Password cannot exceed {PASSWORD_MAX_LENGTH} characters
								</div>
							)}
						</div>
						{password.length > 0 && (
							<ul className="space-y-1 text-xs mt-2">
								{requirementResults.map((req) => (
									<li
										key={req.label}
										className={
											req.met ? "text-green-500" : "text-text-tertiary"
										}
									>
										{req.met ? "\u2713" : "\u2717"} {req.label}
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="space-y-2">
						<label
							htmlFor="confirmPassword"
							className="text-sm text-text-secondary"
						>
							Confirm password
						</label>
						<Input
							id="confirmPassword"
							type="password"
							autoComplete="new-password"
							required
							placeholder="Confirm your password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
						/>
						{confirmPassword.length > 0 && (
							<p
								className={`text-xs mt-1 ${passwordsMatch ? "text-green-500" : "text-red-500"}`}
							>
								{passwordsMatch
									? "\u2713 Passwords match"
									: "\u2717 Passwords don't match"}
							</p>
						)}
					</div>

					<Button
						type="submit"
						disabled={loading || !canSubmit}
						className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse disabled:opacity-50"
					>
						{loading ? "Creating account..." : "Create account"}
					</Button>
				</form>

				<p className="text-center text-sm text-text-secondary">
					Already have an account?{" "}
					<Link
						href="/auth/signin"
						className="text-accent-primary hover:text-accent-hover transition-colors"
					>
						Sign in
					</Link>
				</p>
			</div>
		</div>
	);
}
