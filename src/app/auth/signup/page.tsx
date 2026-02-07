"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { AlphaTag } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth/client";
import {
	PASSWORD_MAX_LENGTH,
	passwordRequirements,
} from "@/lib/validations/auth";

interface PasswordToggleButtonProps {
	visible: boolean;
	onToggle: () => void;
}

function PasswordToggleButton({
	visible,
	onToggle,
}: PasswordToggleButtonProps) {
	const Icon = visible ? EyeOff : Eye;
	return (
		<button
			type="button"
			onClick={onToggle}
			className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
			tabIndex={-1}
		>
			<Icon className="h-4 w-4" />
		</button>
	);
}

function formatPhoneNumber(value: string): string {
	const digits = value.replace(/\D/g, "").slice(0, 10);
	if (digits.length <= 3) return digits;
	if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function stripPhoneFormatting(value: string): string {
	return value.replace(/\D/g, "");
}

export default function SignUpPage() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [phoneNumber, setPhoneNumber] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
		const firstName = formData.get("firstName") as string;
		const lastName = formData.get("lastName") as string;

		const { error } = await signUp.email(
			{
				name: `${firstName} ${lastName}`,
				email: formData.get("email") as string,
				password,
				firstName,
				lastName,
				phoneNumber: stripPhoneFormatting(phoneNumber),
			},
			{
				onSuccess: () => {
					window.location.href = "/";
				},
			},
		);

		if (error) {
			if (error.code === "USER_ALREADY_EXISTS") {
				const email = formData.get("email") as string;
				sessionStorage.setItem("signin_email", email);
				window.location.href = "/auth/signin";
				return;
			}
			setError(error.message || "Something went wrong");
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
						Sign up to start using FortunaBets <AlphaTag />
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
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								required
								placeholder="Create a password"
								className="pr-10"
								value={password}
								onChange={(e) => handlePasswordChange(e.target.value)}
							/>
							<PasswordToggleButton
								visible={showPassword}
								onToggle={() => setShowPassword(!showPassword)}
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
						<div className="relative">
							<Input
								id="confirmPassword"
								type={showConfirmPassword ? "text" : "password"}
								autoComplete="new-password"
								required
								placeholder="Confirm your password"
								className="pr-10"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
							/>
							<PasswordToggleButton
								visible={showConfirmPassword}
								onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
							/>
						</div>
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
