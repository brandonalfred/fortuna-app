"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/client";

function getExistingEmail(): string | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	if (params.get("exists") !== "true") return null;
	const email = sessionStorage.getItem("signin_email");
	sessionStorage.removeItem("signin_email");
	return email;
}

function SignInForm() {
	const [existingEmail] = useState(getExistingEmail);

	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [showNotice, setShowNotice] = useState(!!existingEmail);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setShowNotice(false);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		const { error } = await signIn.email({
			email,
			password,
			callbackURL: "/",
		});

		if (error) {
			setError("Invalid email or password. Please try again.");
			setLoading(false);
		}
	}

	return (
		<div className="w-full max-w-sm space-y-8">
			<div className="text-center">
				<h1 className="font-display text-3xl text-text-primary">
					Welcome back
				</h1>
				<p className="mt-2 text-text-secondary">
					Sign in to continue to FortunaBets
				</p>
			</div>

			{showNotice && (
				<div className="rounded-md bg-accent-primary/10 border border-accent-primary/30 px-4 py-3 text-sm text-accent-primary">
					An account with this email already exists. Please sign in.
				</div>
			)}

			{error && (
				<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
					{error}
				</div>
			)}

			<form onSubmit={handleSubmit} className="space-y-4">
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
						defaultValue={existingEmail ?? ""}
					/>
				</div>

				<div className="space-y-2">
					<label htmlFor="password" className="text-sm text-text-secondary">
						Password
					</label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						placeholder="Enter your password"
						autoFocus={!!existingEmail}
					/>
				</div>

				<Button
					type="submit"
					disabled={loading}
					className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse disabled:opacity-50"
				>
					{loading ? "Signing in..." : "Sign in"}
				</Button>
			</form>

			<p className="text-center text-sm text-text-secondary">
				Don&apos;t have an account?{" "}
				<Link
					href="/auth/signup"
					className="text-accent-primary hover:text-accent-hover transition-colors"
				>
					Sign up
				</Link>
			</p>
		</div>
	);
}

export default function SignInPage() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
			<SignInForm />
		</div>
	);
}
